import * as path from 'path';
import * as fs from 'fs';
import { Page, Frame } from 'playwright';
import { Student, SubmissionStatus, QuestionToReview, GradingResultWithStu, StudentSubmissionStatus } from './types';
import { gradeSubmission } from './llm-api';
import { extractFileContent, isPreviewableFile } from './file-handler';
import { loadRubric } from './utils/rubric-loader';
import { logger } from './utils/logger';
import { config } from './config';

/**
 * Processes assignments in Canvas using Playwright
 */
export class AssignmentProcessor {
    private page: Page;
    private courseId: string;
    private assignmentId: string;
    private rubric: string = '';
    private evaluatedGrades: GradingResultWithStu[] = [];
    private studentSubmissionStatus: Map<string, StudentSubmissionStatus> = new Map<string, StudentSubmissionStatus>();

    /**
     * Creates a new AssignmentProcessor instance
     * @param page - Playwright page object
     * @param courseId - Canvas course ID
     * @param assignmentId - Canvas assignment ID
     */
    constructor(page: Page, courseId: string, assignmentId: string) {
        this.page = page;
        this.courseId = courseId;
        this.assignmentId = assignmentId;

        this.setupResponseListeners();
    }

    private setupResponseListeners(): void {
        this.page.on('response', async (response) => {
            if (response.url().includes(`/speed_grader.json?assignment_id=${this.assignmentId}`)) {
                let responseBody;
                const contentType = response.headers()['content-type'] || '';

                if (contentType.includes('application/json')) {
                    responseBody = await response.json().catch(() => null);
                } else {
                    return;
                }

                if (responseBody) {
                    responseBody.submissions.forEach((submission: any) => {
                        const hasSubmission = submission.missing === false;
                        const studentId: string = submission.user_id;
                        const hasGraded = submission.workflow_state === 'graded';
                        this.studentSubmissionStatus.set(studentId, {
                            studentId,
                            hasSubmission,
                            hasGraded
                        });
                    })
                }
            }
        });
    }

    /**
     * Processes the assignment for all students
     */
    public async processAssignment(): Promise<void> {
        logger.info(`Processing assignment ${this.assignmentId} for course ${this.courseId}`);

        try {
            const content = await fs.promises.readFile(`results/grade-book-${this.assignmentId}.json`, 'utf-8')
            this.evaluatedGrades = JSON.parse(content)
            logger.info(`Loaded processed grading results for assignment ${this.assignmentId}`);
        } catch (error) {
            logger.warn(`Load previous grading results error: ${this.assignmentId}.`);
            this.evaluatedGrades = []
        }

        try {
            // Load rubric for this assignment
            this.rubric = await loadRubric(this.assignmentId);
            logger.debug(`Loaded rubric: ${this.rubric}`);

            // Navigate to the SpeedGrader for the assignment
            const speedGraderUrl = `https://canvas.tongji.edu.cn/courses/${this.courseId}/gradebook/speed_grader?assignment_id=${this.assignmentId}`;
            await this.page.goto(speedGraderUrl, { waitUntil: 'networkidle' });

            // Wait for automatic redirection to complete and the students select menu to appear
            await this.page.waitForSelector('#students_selectmenu', {
                state: 'attached',
                timeout: config.timeouts.navigation
            });

            // Give the page a moment to fully render after redirection
            await this.page.waitForTimeout(1000);

            // Get all students for this assignment
            const students = await this.getAllStudents();
            logger.info(`Found ${students.length} students for grading`);

            // Process each student's submission
            for (const student of students) {
                logger.info(`Processing student: ${student.name} (${student.id})`);

                try {
                    // Navigate to the student's submission
                    await this.navigateToStudentSubmission(student.id);

                    // Check if the student has a submission and if it has been graded
                    const studentSubmissionStatus = this.studentSubmissionStatus.get(student.id);
                    if (studentSubmissionStatus) {
                        if (!studentSubmissionStatus.hasSubmission) {
                            logger.info(`Student ${student.name} has no submission`);
                            await this.submitFeedback('作业未提交');
                            continue;
                        }
                        if (studentSubmissionStatus.hasGraded) {
                            logger.info(`Student ${student.name} has already been graded`);
                            continue;
                        }
                    }

                    if (config.assignmentType === 'single') {
                        // single type assignment
                        const gradeResult = this.evaluatedGrades.find(result => result.studentId === student.id
                            && result.questionId === this.assignmentId);

                        if (!gradeResult) {
                            logger.warn(`No previous grading result found for student ${student.name}`);
                            continue;
                        }
                        logger.info(`Using previous grading result for student ${student.name}`);
                        if (!gradeResult?.grade) {
                            logger.warn(`No grade found for student ${student.name}, skipping`);
                            continue;
                        }
                        if (config.binaryScore) {
                            await this.setQuestionGrade(this.page, this.assignmentId, gradeResult.grade);
                            await this.submitFeedback("已评分");
                        } else {
                            await this.page.fill('#grading-box-extended', gradeResult.grade.toString());
                            await this.submitFeedback(gradeResult.grade === 10 ? "已评分" : gradeResult.comment.replace(/([，,。.；;！!、：:]\s*)?扣\s*[1-9]\s*分/g, ''));
                        }

                        logger.info(`Feedback submitted for student ${student.name}`);
                        continue;
                        // break;
                    }

                    // Check submission status
                    const submissionStatus = await this.checkSubmissionStatus();

                    if (!submissionStatus.hasSubmission) {
                        // If no submission, give default grade (0)
                        logger.info(`Student ${student.name} has no submission. Assigning default grade ${config.defaultGrade}`);
                        await this.submitFeedback('作业未提交');
                    }

                    // If submission needs review, process it
                    if (submissionStatus.needsReview) {
                        await this.processStudentSubmission(student, submissionStatus);
                    } else {
                        logger.info(`Student ${student.name}'s submission already graded`);
                    }
                } catch (error) {
                    logger.error(`Error processing student ${student.name}:`, error);
                    // Continue with next student even if there's an error
                }

                // break; // TODO For debugging, remove this line to process all students

            }
        } catch (error) {
            logger.error('Failed to process assignment:', error);
            throw error;
        }
    }

    /**
     * Gets all students for the current assignment
     */
    private async getAllStudents(): Promise<Student[]> {
        logger.info('Retrieving student list');

        try {
            // Make sure the select element exists before trying to get options
            const selectExists = await this.page.waitForSelector('#students_selectmenu', {
                state: 'attached',
                timeout: config.timeouts.element
            });

            if (!selectExists) {
                throw new Error('Student select menu not found');
            }

            // Directly extract student information from the select element
            const students = await this.page.evaluate(() => {
                const studentElements = document.querySelectorAll('#students_selectmenu option');
                if (studentElements.length === 0) {
                    return [];
                }

                return Array.from(studentElements).map(el => {
                    const option = el as HTMLOptionElement;
                    // Extract student name and clean it by removing status indicators
                    let name = option.textContent?.trim() || '';
                    name = name.replace(/– 已计分|– 未计分|– 未提交/g, '').trim();

                    return {
                        id: option.value,
                        name
                    };
                });
            });

            logger.info(`Found ${students.length} students in the list`);
            return students;
        } catch (error) {
            logger.error('Failed to retrieve student list:', error);
            if (error instanceof Error) {
                throw new Error(`Failed to retrieve student list: ${error.message}`);
            } else {
                throw new Error('Failed to retrieve student list: Unknown error');
            }
        }
    }

    /**
     * Navigates to a specific student's submission
     */
    private async navigateToStudentSubmission(studentId: string): Promise<void> {
        logger.info(`Navigating to student submission: ${studentId}`);

        const submissionUrl = `https://canvas.tongji.edu.cn/courses/${this.courseId}/gradebook/speed_grader?assignment_id=${this.assignmentId}&student_id=${studentId}`;
        await this.page.goto(submissionUrl, { waitUntil: 'domcontentloaded' });

        // Wait for the page to fully load
        if (config.assignmentType === 'single') {
            return;
        }
        try {
            await this.page.waitForSelector('#speedgrader_iframe', {
                state: 'attached',
                timeout: config.timeouts.navigation
            });
        } catch (error) {
            // If iframe doesn't load, check if "no submission" message is displayed
            const noSubmissionElement = await this.page.$('#this_student_does_not_have_a_submission');
            if (noSubmissionElement) {
                logger.info(`No submission found for this student: ${studentId}`);
            } else {
                throw new Error('Failed to load student submission page');
            }
        }
    }

    /**
     * Checks the submission status (submitted, needs review)
     */
    private async checkSubmissionStatus(): Promise<SubmissionStatus> {
        logger.info('Checking submission status');

        // Check if there's no submission by checking if the "no submission" message is visible
        const noSubmissionElement = await this.page.$('#this_student_does_not_have_a_submission');
        const noSubmissionVisible = noSubmissionElement ?
            await noSubmissionElement.isVisible() : false;

        logger.debug('No submission element visible:', noSubmissionVisible);

        if (noSubmissionVisible) {
            logger.info('Student has no submission');
            return {
                hasSubmission: false,
                needsReview: false,
                questionsToReview: []
            };
        }

        // Check if there is a submission by looking for the iframe
        const frameElement = await this.page.$('iframe[id="speedgrader_iframe"]');
        if (!frameElement) {
            logger.info('No iframe found, assuming no submission');
            return {
                hasSubmission: false,
                needsReview: false,
                questionsToReview: []
            };
        }

        // Switch to the iframe to check submission details
        const frame = await frameElement.contentFrame();
        if (!frame) {
            throw new Error('Could not access iframe content');
        }

        // Check if there are questions needing review
        const needsReviewElement = await frame.$('#questions_needing_review');
        if (!needsReviewElement) {
            return {
                hasSubmission: true,
                needsReview: false,
                questionsToReview: []
            };
        }

        // Get all questions that need review
        const questionsToReview = await this.getQuestionsNeedingReview(frame);

        return {
            hasSubmission: true,
            needsReview: true,
            questionsToReview
        };
    }

    /**
     * Gets all questions that need review
     */
    private async getQuestionsNeedingReview(frame: Frame): Promise<QuestionToReview[]> {
        const links = await frame.$$('#questions_needing_review a');
        const questions: QuestionToReview[] = [];

        for (const link of links) {
            const href = await link.getAttribute('href') || '';
            const text = await link.textContent() || '';
            const questionNumber = parseInt(text.replace(/\D/g, '')) || 0;
            const questionId = href.split('#question_')[1];

            // Navigate to the question to extract its maximum points
            await frame.evaluate((id) => {
                const element = document.querySelector(`#question_${id}`);
                if (element) element.scrollIntoView();
            }, questionId);

            // Extract the maximum points from the question header
            let maxPoints = 0;
            try {
                const pointsText = await frame.$eval(
                    `#question_${questionId} .question_points_holder .question_points`,
                    (el) => el.textContent?.trim() || ''
                );

                const pointsMatch = pointsText.match(/(\d+(\.\d+)?)/);
                if (pointsMatch) {
                    maxPoints = parseFloat(pointsMatch[1]);
                }
            } catch (error) {
                logger.warn(`Could not extract maximum points for question ${questionNumber}, using default value of 1`);
                maxPoints = 1; // Default value
            }

            questions.push({
                id: questionId,
                href,
                questionNumber,
                maxPoints
            });
        }

        return questions;
    }

    /**
     * Processes a student's submission
     */
    private async processStudentSubmission(
        student: Student,
        status: SubmissionStatus
    ): Promise<void> {
        logger.info(`Processing submission for student ${student.name}`);

        const frameElement = await this.page.$('iframe[id="speedgrader_iframe"]');
        if (!frameElement) {
            throw new Error('Could not find speedgrader iframe');
        }

        const frame = await frameElement.contentFrame();
        if (!frame) {
            throw new Error('Could not access iframe content');
        }

        // Process each question that needs review
        for (const question of status.questionsToReview) {
            logger.info(`Processing question ${question.questionNumber}`);

            try {
                // Navigate to the question
                await frame.evaluate((questionId) => {
                    const element = document.querySelector(`#question_${questionId}`);
                    if (element) element.scrollIntoView();
                }, question.id);

                // Process the appropriate question type
                const isFileUpload = await this.isFileUploadQuestion(frame, question.id);
                if (isFileUpload) {
                    if (this.evaluatedGrades.some(result => result.questionId === question.id
                        && result.studentId === student.id)) {
                        await this.gradeByPreviousGradingResults(question, student, frame);
                    } else {
                        await this.processFileUploadQuestion(frame, question, student);
                    }
                } else {
                    await this.processRegularQuestion(frame, question);
                }
            } catch (error) {
                logger.error(`Error processing question ${question.questionNumber}:`, error);
            }
        }

        // await this.page.pause(); for debugging

        // Finalize the submission grading
        await this.finalizeGrading(frame);
    }

    /**
     * Checks if a question is a file upload type
     */
    private async isFileUploadQuestion(frame: Frame, questionId: string): Promise<boolean> {
        // Check if the question element itself has the file_upload_question class
        const hasFileUploadClass = await frame.evaluate((id) => {
            const questionElement = document.querySelector(`#question_${id}`);
            return questionElement?.classList.contains('file_upload_question');
        }, questionId);

        // As a fallback, also check for the file upload holder element
        const hasFileUploadHolder = await frame.$(`#question_${questionId} .file-upload-question-holder`);

        return hasFileUploadClass || !!hasFileUploadHolder;
    }

    private async gradeByPreviousGradingResults(
        question: QuestionToReview,
        student: Student,
        frame: Frame
    ): Promise<void> {
        const gradingResult = this.evaluatedGrades.find(result => result.questionId === question.id
            && result.studentId === student.id);
        if (!gradingResult) {
            logger.warn(`No previous grading result found for question ${question.id} and student ${student.id}`);
            return;
        }
        logger.info(`Using previous grading result for question ${question.id} for student ${student.id}`);
        await this.setQuestionGrade(frame, question.id, gradingResult.grade);
        await this.setQuestionComment(frame, question.id, gradingResult.grade === question.maxPoints ? "已批阅" : gradingResult.comment);
    }

    /**
     * Processes a file upload question
     */
    private async processFileUploadQuestion(
        frame: Frame,
        question: QuestionToReview,
        student: Student
    ): Promise<void> {
        logger.info(`Processing file upload question ${question.questionNumber} (max points: ${question.maxPoints})`);

        // Get question text
        const questionText = await frame.$eval(
            `#question_${question.id}_question_text`,
            (el) => el.innerHTML?.trim() || ''
        );

        // Find the file download link
        const fileLink = await frame.$(`#question_${question.id} a[href*="/files/"]`);
        if (!fileLink) {
            throw new Error('No submitted file found');
        }

        // Get file details
        const fileName = (await fileLink.textContent())?.trim() || '';
        const downloadUrl = (await fileLink.getAttribute('href'))?.trim() || '';

        if (!downloadUrl) {
            throw new Error('Invalid download URL');
        }

        let fileContent = '';
        let skipGrading = false;

        try {
            // Store current frame state/URL
            const currentUrl = frame.url();
            logger.debug(`Current frame URL before extraction: ${currentUrl}`);

            // Check if file is likely previewable
            if (!isPreviewableFile(fileName)) {
                logger.warn(`File ${fileName} is not a previewable type, skipping content extraction`);
                fileContent = `[This file type (${path.extname(fileName)}) cannot be previewed. Please grade manually.]`;
                skipGrading = true;
            } else {
                // Extract file content from the preview
                const extractionResult = await extractFileContent(
                    this.page,
                    downloadUrl,
                    fileName,
                    student.id
                );
                fileContent = extractionResult.content;

                // Verify we're back on the correct page/question
                if (frame.url() !== currentUrl) {
                    logger.warn('Frame URL changed after extraction, attempting to navigate back');
                    await frame.goto(currentUrl);

                    // Make sure we're focused on the right question again
                    await frame.evaluate((id) => {
                        const element = document.querySelector(`#question_${id}`);
                        if (element) element.scrollIntoView();
                    }, question.id);
                }
            }
        } catch (error) {
            logger.error(`Error extracting file content: ${error}`);
            fileContent = `[Error extracting file content. Please grade manually.]`;
            skipGrading = true;
        }

        // Determine what score/feedback to provide
        if (skipGrading) {
            // If we couldn't extract content, leave a note and don't grade
            await this.setQuestionComment(
                frame,
                question.id,
                "This submission requires manual grading because the file type cannot be automatically reviewed."
            );
            logger.info(`Skipping automatic grading for question ${question.questionNumber}`);
            return;
        }

        // Prepare rubric with actual max points
        const questionRubric = this.rubric.replace('{maxPoints}', question.maxPoints.toString());

        // Grade the submission using LLM
        const gradingResult = await gradeSubmission({
            prompt: config.llm.basePrompt,
            question: questionText,
            studentSubmission: fileContent,
            rubric: questionRubric,
            maxPoints: question.maxPoints,
        });

        // Record the grade and feedback
        await this.setQuestionGrade(frame, question.id, gradingResult.score);
        await this.setQuestionComment(frame, question.id, gradingResult.feedback);
    }

    /**
     * Processes a regular (text-based) question
     */
    private async processRegularQuestion(frame: Frame, question: QuestionToReview): Promise<void> {
        logger.info(`Processing regular question ${question.questionNumber} (max points: ${question.maxPoints})`);

        // Get question text
        const questionText = await frame.$eval(
            `#question_${question.id}_question_text`,
            (el) => el.textContent?.trim() || ''
        );

        // Get student's submission text
        const studentSubmission = await frame.$eval(
            `#question_${question.id}_text .quiz_response_text`,
            (el) => el.textContent?.trim() || ''
        ).catch(() => '');

        // Handle empty submissions
        if (!studentSubmission) {
            logger.info(`No text submission for question ${question.questionNumber}, assigning 0 points`);
            await this.setQuestionGrade(frame, question.id, 0);
            await this.setQuestionComment(frame, question.id, "No answer provided");
            return;
        }

        // Prepare rubric with actual max points
        const questionRubric = this.rubric.replace('{maxPoints}', question.maxPoints.toString());

        // Grade the submission using LLM
        const gradingResult = await gradeSubmission({
            prompt: config.llm.basePrompt,
            question: questionText,
            studentSubmission: studentSubmission,
            rubric: questionRubric,
            maxPoints: question.maxPoints,
        });

        // Record the grade and feedback
        await this.setQuestionGrade(frame, question.id, gradingResult.score);
        await this.setQuestionComment(frame, question.id, gradingResult.feedback);
    }

    /**
     * Sets a grade for a specific question
     */
    /**
     * Sets a grade for a specific question
     */
    private async setQuestionGrade(frame: Frame | Page, questionId: string, grade: number): Promise<void> {
        logger.info(`Setting grade ${grade} for question ${questionId}`);

        // First try to find the standard score input field
        const standardScoreField = await frame.$(`#question_score_${questionId}_visible`);

        if (standardScoreField) {
            // If the standard score field exists, use it
            await frame.fill(`#question_score_${questionId}_visible`, grade.toString(), { timeout: config.timeouts.element });
        } else {
            // Check if we have a dropdown select instead
            const selectField = await frame.$(`#grading-box-extended`);

            if (selectField) {
                // If the grade is not 0, select "complete"
                if (grade > 0) {
                    await frame.selectOption('#grading-box-extended', 'complete');
                } else {
                    // For 0 grade, select an appropriate option like "incomplete" or the first option
                    await frame.selectOption('#grading-box-extended', 'incomplete');
                }
                logger.info(`Used dropdown selection for grading: ${grade > 0 ? 'complete' : 'incomplete'}`);
            } else {
                logger.warn(`Could not find grading input for question ${questionId}`);
            }
        }
    }

    /**
     * Sets a comment for a specific question
     */
    private async setQuestionComment(frame: Frame, questionId: string, comment: string): Promise<void> {
        logger.info(`Setting comment for question ${questionId}`);
        await frame.fill(`#question_comment_${questionId}`, comment);
    }

    /**
     * Finalizes grading by updating scores and submitting feedback
     */
    private async finalizeGrading(frame: Frame): Promise<void> {
        // Update the score in Canvas
        await this.clickUpdateScoreButton(frame);

        // Wait for Canvas to recalculate
        await this.page.waitForTimeout(3000);

        // Get the calculated grade
        const calculatedGrade = await this.getCalculatedGrade();
        logger.info(`Canvas calculated overall grade: ${calculatedGrade}`);

        // Submit the feedback
        await this.submitFeedback('已批阅');
    }

    /**
     * Gets the grade calculated by Canvas
     */
    private async getCalculatedGrade(): Promise<number> {
        try {
            const gradeText = await this.page.$eval('#grading-box-extended',
                (el) => (el as HTMLInputElement).value);
            return parseFloat(gradeText) || 0;
        } catch (error) {
            logger.error('Error getting calculated grade:', error);
            return 0;
        }
    }

    /**
     * Submits feedback for a student
     */
    private async submitFeedback(feedback: string): Promise<void> {
        logger.info(`Submitting feedback: ${feedback}`);

        // Add and submit the comment
        await this.page.fill('#speed_grader_comment_textarea', feedback);
        await this.page.click('#comment_submit_button');

        // Wait for submission confirmation
        await this.page.waitForSelector('#comment_submitted', {
            state: 'visible',
            timeout: config.timeouts.submission
        }).catch(() => logger.warn('Comment submission confirmation not shown, but continuing'));

        // Ensure everything is saved
        await this.page.waitForTimeout(1000);

        logger.info('Feedback submitted successfully');
    }

    /**
     * Clicks the "Update Score" button to recalculate the total score
     */
    private async clickUpdateScoreButton(frame: Frame): Promise<void> {
        logger.info('Updating total score calculation');

        try {
            // Try different approaches to find and click the update button

            // 1. Try to find by text content
            const buttonSelector = await frame.$$eval('button', (buttons) => {
                const updateButton = buttons.find(btn => {
                    const text = btn.textContent?.toLowerCase() || '';
                    return text.includes('update') || text.includes('更新分数');
                });
                return updateButton ? (updateButton.id ? `#${updateButton.id}` : `.${updateButton.className.split(' ')[0]}`) : null;
            });

            if (buttonSelector) {
                await frame.click(buttonSelector);
                return;
            }

            // 2. Try common button selectors
            const commonSelectors = [
                'button.update-scores',
                'button.update_scores_button',
                'button.quiz_button',
                'button[type="submit"]'
            ];

            for (const selector of commonSelectors) {
                const buttonExists = await frame.$(selector);
                if (buttonExists) {
                    await frame.click(selector);
                    return;
                }
            }

            // 3. Try any button with update-related text
            const allButtons = await frame.$$('button');
            for (const button of allButtons) {
                const buttonText = await button.textContent();
                if (buttonText && (buttonText.includes('Update') || buttonText.includes('更新'))) {
                    await button.click();
                    return;
                }
            }

            logger.warn('Could not find the Update Score button, Canvas may not update the total score automatically');
        } catch (error) {
            logger.error('Error updating score:', error);
        }
    }
}

/**
 * Public function that creates and uses the AssignmentProcessor class
 */
export async function processAssignment(
    page: Page,
    courseId: string,
    assignmentId: string
): Promise<void> {
    const processor = new AssignmentProcessor(page, courseId, assignmentId);
    await processor.processAssignment();
}
