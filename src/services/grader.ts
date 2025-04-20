import * as fs from 'fs';
import { OpenAI } from 'openai';
import { Question, GradingResult, SubmissionInfo } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { formatDateTime } from '../utils/tools';
import { LLMService } from './llm';

export class GradingService {
  private llm: LLMService;
  private batch_items: Record<string, any>[] = []

  constructor() {
    this.llm = new LLMService();
  }

  /**
   * Grade a submission using LLM
   */
  async gradeSubmission(
    submission: SubmissionInfo,
    content: string,
    question: Question
  ): Promise<GradingResult> {
    try {
      logger.info(`Grading submission for student ${submission.studentId}, question ${submission.questionId}`);

      const maxPoint = question.maxPoint || 100;
      const rubric = question.rubric.replace('{maxPoint}', maxPoint.toString());
      const questionDescription = question.description || 'No description provided';

      // Construct the prompt for LLM
      const prompt = this.constructPrompt(content, questionDescription, rubric, maxPoint);
      const response = await this.llm.getResponse(prompt);
      if (!response) {
        throw new Error('Empty response from LLM');
      }

      // Parse the LLM response
      const gradingResult = this.parseResponse(response, submission.studentId, submission.questionId);
      logger.info(`Graded submission for student ${submission.studentId}, score: ${gradingResult.grade}/${maxPoint}`);
      return gradingResult;

    } catch (error) {
      logger.error(`Error grading submission: ${error}`);
      // Return default error response
      return {
        studentId: submission.studentId,
        questionId: submission.questionId,
        grade: 0,
        comment: `> Error grading submission: ${error instanceof Error ? error.message : 'Unknown error'}`,
        gradedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    }
  }

  /**
   * Construct the prompt to send to the LLM
   */
  private constructPrompt(content: string, questionDescription: string, rubric: string, maxPoint: number): string {
    return `
**Question Description**:
\`\`\`
${questionDescription}
\`\`\`

**Student Submission**:
\`\`\`python
${content}
\`\`\`

**Grading Rubric**:
${rubric}

Please grade this submission based on the rubric above. The grade should be out of ${maxPoint} points.
Provide your response in JSON format with the following structure:
{
  "grade": <numeric grade>,
  "comment": "<feedback in Chinese>"
}
`;
  }

  /**
   * Parse the LLM's response into a GradingResult
   */
  private parseResponse(response: string, studentId: string, questionId: string): GradingResult {
    try {
      const data = JSON.parse(response);

      // Validate the response format
      if (typeof data.grade === 'undefined' || typeof data.comment === 'undefined') {
        throw new Error('Invalid response format');
      }

      // Ensure grade is numeric
      const grade = typeof data.grade === 'string' ? parseFloat(data.grade) : data.grade;

      return {
        studentId,
        questionId,
        grade: isNaN(grade) ? 0 : grade,
        comment: data.comment.toString(),
        gradedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    } catch (error) {
      logger.warn(`Error parsing LLM response: ${error}`);
      logger.info("Try to parse the response by regex");
      // Fallback to regex parsing if JSON parsing fails
      const regex = /"grade":\s*([\d.]+),\s*"comment":\s*"(.*?)"/;
      const match = response.match(regex);
      if (match) {
        const grade = parseFloat(match[1]);
        const comment = match[2];

        return {
          studentId,
          questionId,
          grade: isNaN(grade) ? 0 : grade,
          comment,
          gradedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        };
      }
      return {
        studentId,
        questionId,
        grade: 0,
        comment: `> Error parsing grading response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        gradedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    }
  }

  /**
   * Parse the batch response file and extract grading results
   * 
   * @param filePath - The path to the file containing batch results
   * @returns GradingResult[] - An array of grading results parsed from the file
   */
  private async parseBatchResponse(filePath: string): Promise<GradingResult[]> {
    const batchRes = await fs.promises.readFile(filePath, 'utf-8');
    const lines = batchRes.split('\n').filter(line => line.trim() !== '');
    const results: GradingResult[] = [];
    for (const line of lines) {
      if (line.length <= 2 || line[0] !== '{') {
        continue; // Skip non-JSON lines
      }
      try {
        const data = JSON.parse(line);
        const [studentId, questionId] = data.custom_id.split('_');
        const response = data.response.body.choices[0].message.content;
        const gradingResult = this.parseResponse(response, studentId, questionId);
        results.push(gradingResult);
      } catch (error) {
        logger.error(`Error parsing batch result line: ${line}, error: ${error}`);
      }
    }
    return results;
  }

  public addBatchItem(
    submission: SubmissionInfo,
    content: string,
    question: Question
  ): string {
    const maxPoint = question.maxPoint || 100;
    const rubric = question.rubric.replace('{maxPoint}', maxPoint.toString());
    const questionDescription = question.description || 'No description provided';

    // Construct the prompt for LLM
    const prompt = this.constructPrompt(content, questionDescription, rubric, maxPoint);
    const body = {
      "model": config.llm.model,
      "messages": [
        { role: 'system', content: config.llm.basePrompt },
        { role: 'user', content: prompt }
      ]
    }

    const custom_id = `${submission.studentId}_${submission.questionId}`;
    const item = {
      "custom_id": custom_id,
      "method": "POST",
      "url": "/v1/chat/completions", //  /v1/chat/completions
      "body": body,
    }
    this.batch_items.push(item);

    return custom_id;
  }


  public async clearBatchItems(): Promise<void> {
    this.batch_items = [];
  }

  public async batchGradingResult(waitForCompletion: boolean = true): Promise<GradingResult[]> {
    const assignmentId = config.assignmentId;
    const folderPath = `./results/batch_${assignmentId}`;
    try {
      await fs.promises.mkdir(folderPath, { recursive: true });
    } catch (error) {

    }
    logger.info(`Start batch grading, batch size: ${this.batch_items.length}`);

    const content = this.batch_items.map(item => JSON.stringify(item)).join('\n');
    await fs.promises.writeFile(`${folderPath}/input_file.jsonl`, content, 'utf-8');

    const outputFilePath = await this.llm.batchProcess(folderPath, waitForCompletion);
    if (!waitForCompletion) {
      return []; // Return empty array if not waiting for completion
    }
    if (!outputFilePath) {
      throw new Error('Batch processing failed, no output file path returned');
    }

    return this.parseBatchResponse(outputFilePath);
  }


  /**
   * Get the batch result from the LLM service
   * @returns GradingResult[] - An array of grading results parsed from the batch response file
   */
  public async getBatchResult(): Promise<GradingResult[]> {
    const assignmentId = config.assignmentId;
    const folderPath = `./results/batch_${assignmentId}`;
    // get batch_id
    const batchId = (await fs.promises.readFile(`${folderPath}/batch_id.txt`, 'utf-8')).trim();

    const outputFilePath = await this.llm.getBatchResult(folderPath, batchId);
    if (!outputFilePath) {
      throw new Error('Batch processing failed, no output file path returned');
    }
    return this.parseBatchResponse(outputFilePath);
  }
}
