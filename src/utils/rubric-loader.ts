import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { logger } from './logger';
import { RubricFile } from '../types';

// Convert fs functions to Promise-based
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);

/**
 * Loads a rubric file for a specific assignment
 * @param assignmentId The ID of the assignment
 * @returns The content of the rubric file
 */
export async function loadRubric(assignmentId: string): Promise<string> {
  logger.info(`Loading rubric for assignment ${assignmentId}`);
  
  const rubricPath = path.join(process.cwd(), 'rubrics', `${assignmentId}.txt`);
  
  try {
    // Check if the file exists
    await access(rubricPath, fs.constants.R_OK);
    
    // Read the rubric file content
    const content = await readFile(rubricPath, 'utf-8');
    logger.info(`Rubric loaded successfully for assignment ${assignmentId}`);
    return content;
  } catch (error) {
    logger.warn(`Rubric file not found or not readable for assignment ${assignmentId}. Using default rubric.`);
    return `Grade out of {maxPoints} points.`;
  }
}
