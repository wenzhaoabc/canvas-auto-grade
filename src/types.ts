/**
 * Student information
 */
export interface Student {
  id: string;
  name: string;
}

/**
 * Question that needs review
 */
export interface QuestionToReview {
  id: string;
  href: string;
  questionNumber: number;
  maxPoints: number; // Added maximum points for the question
}

/**
 * Submission status information
 */
export interface SubmissionStatus {
  hasSubmission: boolean;
  needsReview: boolean;
  questionsToReview: QuestionToReview[];
}

/**
 * LLM request for grading
 */
export interface GradingRequest {
  prompt: string;
  question: string;
  studentSubmission: string;
  rubric: string;
  maxPoints: number;
}

/**
 * LLM response for grading
 */
export interface GradingResult {
  score: number;
  feedback: string;
  explanation?: string;
}

/**
 * Results of processed submission
 */
export interface ProcessedSubmission {
  studentId: string;
  studentName: string;
  hasSubmission: boolean;
  grade: number;
  feedback: string;
  timestamp: string;
}

/**
 * Canvas authentication details
 */
export interface CanvasAuth {
  username: string;
  password: string;
}

/**
 * Canvas assignment details
 */
export interface AssignmentDetails {
  id: string;
  name: string;
  courseId: string;
  maxPoints: number;
}

/**
 * Grading criteria for a specific question
 */
export interface QuestionGradingCriteria {
  rubric: string;
  maxPoints: number;
}

/**
 * Question with extracted details
 */
export interface QuestionDetails {
  id: string;
  questionNumber: number;
  questionText: string;
  studentSubmission: string;
  maxPoints: number;
  filePath?: string;
}

/**
 * Rubric file content for an assignment
 */
export interface RubricFile {
  assignmentId: string;
  content: string;
}

/**
 * File content extraction result
 */
export interface FileContentResult {
  content: string;
  filePath: string;
  isPreviewable: boolean;
}
