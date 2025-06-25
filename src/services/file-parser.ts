import * as fs from 'fs';
import * as path from 'path';
import { SubmissionInfo, Question, AssignmentType } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Parse the submission file name to extract student information and question ID
 * Format: <studentNumber:7位><studentId:6位>_question_<questionId:6位>_<submissionId:7位>_<fileName>
 */
export function parseFileName(filePath: string, assignmentType: AssignmentType): SubmissionInfo | null {
    try {
        const fileName = path.basename(filePath);
        // Match file name pattern
        let regex: RegExp;
        if (assignmentType === AssignmentType.GROUP) {
            regex = /^(\d{7})(\d{6})_question_(\d{6})_(\d{7})_(.+)$/;
        } else if (assignmentType === AssignmentType.SINGLE) {
            regex = /^(\d{7})_(?:LATE_)?(\d{6})_(\d{7})_(.+)$/; // LATE_ is optional
        } else {
            throw new Error(`Unsupported assignment type: ${assignmentType}`);
        }
        const match = fileName.match(regex);

        if (!match) {
            logger.warn(`Invalid file name format: ${fileName}`);
            return null;
        }

        if (assignmentType === AssignmentType.GROUP) {

            const [, studentNumber, studentId, questionId, submissionId, originalFileName] = match;

            return {
                studentNumber,
                studentId,
                questionId,
                submissionId,
                files: [filePath],
            };
        }
        else if (assignmentType === AssignmentType.SINGLE) {

            const [, studentNumber, studentId, submissionId, originalFileName] = match;

            return {
                studentNumber,
                studentId,
                questionId: config.assignmentId, // Use assignmentId as questionId for single submission
                submissionId,
                files: [filePath],
            };
        } else {
            throw new Error(`Unsupported assignment type: ${assignmentType}`);
        }
    } catch (error) {
        logger.error(`Error parsing file name ${filePath}: ${error}`);
        return null;
    }
}

/**
 * Get all submission files from the download directory
 */
export async function getSubmissionFiles(directory: string, assignmentType: AssignmentType): Promise<SubmissionInfo[]> {
    try {
        if (!fs.existsSync(directory)) {
            logger.error(`Directory does not exist: ${directory}`);
            return [];
        }

        const stuIdSubFile: Map<string, SubmissionInfo> = new Map();
        const files = fs.readdirSync(directory);

        for (const file of files) {
            const filePath = path.join(directory, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile()) {
                const info = parseFileName(filePath, assignmentType);
                if (!info) {
                    logger.warn(`Skipping invalid file: ${file}`);
                    continue;
                }
                // Check if the student ID already exists in the map
                if (stuIdSubFile.has(info.studentId)) {
                    // If it exists, append the new submission content
                    const files = stuIdSubFile.get(info.studentId)?.files || [];
                    files.push(info.files[0]); // Add the new file path
                    info.files = files; // Update the info with all files
                    stuIdSubFile.set(info.studentId, info);
                } else {
                    // If not, create a new entry
                    stuIdSubFile.set(info.studentId, info);
                }
            }
        }
        // Convert the map values to an array
        const submissions = Array.from(stuIdSubFile.values());

        logger.info(`Found ${submissions.length} submission files in ${directory}`);
        return submissions;
    } catch (error) {
        logger.error(`Error reading submission files: ${error}`);
        return [];
    }
}

/**
 * Load questions from the rubrics directory
 */
export function loadQuestions(rubricsDir: string): Map<string, Question> {
    const questionMap = new Map<string, Question>();

    try {
        if (!fs.existsSync(rubricsDir)) {
            logger.error(`Rubrics directory does not exist: ${rubricsDir}`);
            return questionMap;
        }

        const files = fs.readdirSync(rubricsDir);

        for (const file of files) {
            // Expect file name to be questionId.txt
            const questionId = path.basename(file, path.extname(file));
            const filePath = path.join(rubricsDir, file);

            try {
                const content = fs.readFileSync(filePath, 'utf-8');

                // Parse the content according to the given format
                // #Question, #Rubric, #MaxPoint
                const questionMatch = content.match(/#Question\s*([\s\S]*?)(?=#Rubric|$)/);
                const rubricMatch = content.match(/#Rubric\s*([\s\S]*?)(?=#MaxPoint|$)/);
                const maxPointMatch = content.match(/#MaxPoint\s*(\d+)/);

                const description = questionMatch ? questionMatch[1].trim() : '';
                const rubric = rubricMatch ? rubricMatch[1].trim() : content.trim(); // Fallback to entire content if no sections found
                const maxPoint = maxPointMatch ? parseInt(maxPointMatch[1], 10) : undefined;

                questionMap.set(questionId, {
                    questionId,
                    description,
                    rubric,
                    maxPoint
                });

                logger.debug(`Loaded rubric for question ID: ${questionId}`);
                logger.debug(`  Description: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
                logger.debug(`  Max Points: ${maxPoint || 'undefined'}`);
            } catch (error) {
                logger.error(`Error reading rubric file ${filePath}: ${error}`);
            }
        }

        logger.info(`Loaded ${questionMap.size} question rubrics`);
        return questionMap;
    } catch (error) {
        logger.error(`Error loading rubrics: ${error}`);
        return questionMap;
    }
}
