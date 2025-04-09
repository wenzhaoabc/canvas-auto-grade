import OpenAI from 'openai';
import { Question, GradingResult, SubmissionInfo } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export class GradingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
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

      // Construct the prompt for LLM
      const prompt = this.constructPrompt(content, rubric, maxPoint);

      // Call the LLM API
      const response = await this.openai.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: 'system', content: config.llm.basePrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: config.llm.maxTokens,
        temperature: config.llm.temperature,
        response_format: { type: 'json_object' }
      });

      if (!response.choices[0]?.message?.content) {
        throw new Error('Empty response from LLM');
      }

      // Parse the LLM response
      const responseContent = response.choices[0].message.content;
      const gradingResult = this.parseResponse(responseContent, submission.studentId, submission.questionId);

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
  private constructPrompt(content: string, rubric: string, maxPoint: number): string {
    return `
Assignment Submission:
\`\`\`
${content}
\`\`\`

Grading Rubric:
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
      logger.error(`Error parsing LLM response: ${error}`);
      logger.debug(`Raw response: ${response}`);
      return {
        studentId,
        questionId,
        grade: 0,
        comment: `> Error parsing grading response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        gradedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    }
  }
}
