import * as fs from 'fs';
import * as path from 'path';
import { GradingResult } from '../types';
import { logger } from '../utils/logger';

export class ResultStorage {
  private outputPath: string;
  private results: GradingResult[] = [];

  constructor(outputDirectory: string, assignmentId: string) {
    // Ensure directory exists
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    this.outputPath = path.join(outputDirectory, `grade-book-${assignmentId}.json`);
  }

  /**
   * Add a grading result
   */
  addResult(result: GradingResult): void {
    this.results.push(result);
    logger.debug(`Added result for student ${result.studentId}, question ${result.questionId}`);
  }

  /**
   * Save all results to the output file
   */
  async saveResults(): Promise<string> {
    try {
      await fs.promises.writeFile(
        this.outputPath,
        JSON.stringify(this.results, null, 2),
        'utf-8'
      );
      logger.info(`Saved ${this.results.length} grading results to ${this.outputPath}`);
      return this.outputPath;
    } catch (error) {
      logger.error(`Error saving results: ${error}`);
      throw error;
    }
  }

  /**
   * Load existing results from a file
   */
  async loadResults(filePath?: string): Promise<boolean> {
    if (!filePath) {
      filePath = this.outputPath;
    }
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`File does not exist: ${filePath}`);
        return false;
      }

      const data = await fs.promises.readFile(filePath, 'utf-8');
      this.results = JSON.parse(data);
      logger.info(`Loaded ${this.results.length} results from ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Error loading results from ${filePath}: ${error}`);
      return false;
    }
  }

  /**
   * Get all stored results
   */
  getResults(): GradingResult[] {
    return this.results;
  }

  /**
   * Check if a result already exists for a student and question
   */
  resultExists(studentId: string, questionId: string): boolean {
    return this.results.some(r => r.studentId === studentId && r.questionId === questionId);
  }
}
