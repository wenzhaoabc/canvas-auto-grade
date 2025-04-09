import 'dotenv/config';
import * as path from 'path';
import { config } from './src/config';
import { logger } from './src/utils/logger';
import { getSubmissionFiles, loadQuestions, parseFileName } from './src/services/file-parser';
import { ContentExtractionService } from './src/services/content-extractor';
import { GradingService } from './src/services/grader';
import { ResultStorage } from './src/services/result-storage';

async function main() {
    try {
        logger.info('Starting Auto Grading process');

        // Initialize services
        const contentExtractor = new ContentExtractionService();
        const gradingService = new GradingService();
        const resultStorage = new ResultStorage('./results', config.assignmentId);
        await resultStorage.loadResults(); // Load existing results if any

        // Load questions
        const questionsDir = path.join(process.cwd(), 'questions');
        const questions = loadQuestions(questionsDir);
        logger.info(`Loaded ${questions.size} question rubrics`);

        // Get submission files
        const downloadsDir = path.resolve(process.env.DOWNLOAD_PATH || './downloads');
        const submissions = await getSubmissionFiles(downloadsDir);
        logger.info(`Found ${submissions.length} submission files`);

        // Process each submission
        let processedCount = 0;
        let errorCount = 0;

        for (const submission of submissions) {
            try {
                // Skip if we don't have a rubric for this question
                if (!questions.has(submission.questionId)) {
                    logger.warn(`No rubric found for question ${submission.questionId}, skipping`);
                    continue;
                }

                // Skip if already graded
                if (resultStorage.resultExists(submission.studentId, submission.questionId)) {
                    logger.info(`Submission for student ${submission.studentId}, question ${submission.questionId} already graded, skipping`);
                    continue;
                }

                // Extract content from file
                const content = await contentExtractor.extractContent(submission.filePath);

                // Grade the submission
                const question = questions.get(submission.questionId)!;
                const result = await gradingService.gradeSubmission(submission, content, question);

                // Store the result
                resultStorage.addResult(result);
                processedCount++;

                // Save intermediate results periodically
                if (processedCount % 10 === 0) {
                    await resultStorage.saveResults();
                    logger.info(`Processed ${processedCount} submissions so far`);
                }
            } catch (error) {
                logger.error(`Error processing submission ${submission.filePath}: ${error}`);
                errorCount++;
            }

            // if (processedCount >= 6) {
            //     break; // TODO : Remove this line to process all submissions
            // }
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

