/**
 * Represents information parsed from a submission file name
 */
export interface SubmissionInfo {
  studentNumber: string;
  studentId: string;
  questionId: string;
  submissionId: string;
  fileName: string;
  filePath: string;
}

/**
 * Represents a question with its grading rubric
 */
export interface Question {
  questionId: string;
  description?: string;
  maxPoint?: number;
  rubric: string;
}

/**
 * Represents the grading result of a submission
 */
export interface GradingResult {
  studentId: string;
  questionId: string;
  grade: number;
  comment: string;
  gradedAt: string; // LocaleString, eg '2025/4/9 16:10:12'
}

/**
 * Supported file types for content extraction
 */
export enum FileType {
  TEXT = 'text',
  PDF = 'pdf',
  DOCX = 'docx',
  ZIP = 'zip',
  UNKNOWN = 'unknown'
}

/**
 * Interface for file content extractors
 */
export interface ContentExtractor {
  canHandle(filePath: string): boolean;
  extractContent(filePath: string): Promise<string>;
}
