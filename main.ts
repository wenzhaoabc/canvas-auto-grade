import 'dotenv/config';
import * as path from 'path';
import { config } from './src/config';
import { logger } from './src/utils/logger';
import { getSubmissionFiles, loadQuestions } from './src/services/file-parser';
import { ContentExtractionService } from './src/services/content-extractor';
import { GradingService } from './src/services/grader';
import { ResultStorage } from './src/services/result-storage';
import { AssignmentType, Question, SubmissionInfo, GradingResult } from './src/types';

// Initialize services
const extractor = new ContentExtractionService();
const grader = new GradingService();
const resultStorage = new ResultStorage('./results', config.assignmentId);


async function processSubmission(
  submission: SubmissionInfo,
  question: Question
): Promise<GradingResult | { error: boolean }> {
  try {
    // Extract content from file
    const content = await extractor.extractContent(submission.filePath);

    // Grade the submission
    const result = await grader.gradeSubmission(submission, content, question);

    return result;
  } catch (error) {
    logger.error(`Error processing submission for question ${question.questionId} for student ${submission.studentId} : ${error}`);
    return { error: true };
  }
}



async function main() {
  try {
    logger.info('Starting Auto Grading process');

    await resultStorage.loadResults(); // Load existing results if any
    const assignmentType = config.assignmentType as AssignmentType; // 'single' or 'group'
    logger.info(`Assignment type: ${assignmentType}`);

    // Load questions
    const questionsDir = path.join(process.cwd(), 'questions');
    const questions = loadQuestions(questionsDir);
    logger.info(`Loaded ${questions.size} question rubrics`);

    // Get submission files
    const downloadsDir = path.resolve(process.env.DOWNLOAD_PATH || './downloads');
    const submissions = await getSubmissionFiles(downloadsDir, assignmentType);
    logger.info(`Found ${submissions.length} submission files`);

    // Process each submission
    let processedCount = 0;
    let errorCount = 0;
    const totalSubmissions = submissions.length;

    // Filter out submissions that are needed to be graded
    const filteredSubmissions = submissions.filter(submission => {
      return questions.has(submission.questionId)
        && !resultStorage.resultExists(submission.studentId, submission.questionId);
    });
    logger.info(`Filtered ${filteredSubmissions.length} submissions for grading`);

    const batchSize = 10; // Number of submissions to process in each batch
    const batches: SubmissionInfo[][] = [];
    for (let i = 0; i < filteredSubmissions.length; i += batchSize) {
      batches.push(filteredSubmissions.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const results = await Promise.all(batch.map(submission => {
        const question = questions.get(submission.questionId)!;
        return processSubmission(submission, question);
      }));

      for (const result of results) {
        if (result && !('error' in result)) {
          resultStorage.addResult(result);
          processedCount++;
        } else {
          errorCount++;
        }
      }

      // Save intermediate results periodically
      await resultStorage.saveResults();
      // Log dynamic progress, progress bar, etc.
      const progress = Math.round((processedCount / totalSubmissions) * 100);
      logger.info(`Progress: ${progress}% (${processedCount}/${totalSubmissions})`);

      // break; // Remove this line to process all batches in parallel
    }

    // Save final results
    const outputPath = await resultStorage.saveResults();
    logger.info(`Grading complete. Processed ${processedCount} submissions with ${errorCount} errors.`);
    logger.info(`Results saved to ${outputPath}`);

  } catch (error) {
    logger.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

// Run the application
main()
  .then(() => {
    logger.info('Auto Grading process completed successfully');
  })
  .catch(error => {
    logger.error(`Uncaught error: ${error}`);
    process.exit(1);
  })
  .finally(() => {
    logger.info('Exiting application');
    process.exit(0);
  });

