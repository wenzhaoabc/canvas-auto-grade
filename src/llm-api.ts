import OpenAI from 'openai';
import { GradingRequest, GradingResult } from './types';
import { config } from './config';
import { logger } from './utils/logger';

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: config.llm.apiKey
});

/**
 * Sends a submission to LLM for grading
 * @param request Grading request with submission details
 * @returns Grading result with score and feedback
 */
export async function gradeSubmission(request: GradingRequest): Promise<GradingResult> {
  logger.info('Sending submission to LLM for grading');
  
  try {
    // Format the prompt for the LLM
    const prompt = formatGradingPrompt(request);

    logger.debug('LLM grading prompt:', prompt);
    
    // Call the LLM API
    const completion = await openai.chat.completions.create({
      model: config.llm.model,
      messages: [
        {
          role: 'system',
          content: config.llm.basePrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: config.llm.maxTokens,
      temperature: config.llm.temperature
    });
    
    // Extract the response content
    const responseContent = completion.choices[0]?.message?.content || '';
    
    // Parse the response to extract grade and feedback
    return parseGradingResponse(responseContent, request.maxPoints);
    
  } catch (error) {
    logger.error('Error calling LLM API:', error);
    
    // Return a fallback result if LLM fails
    return {
      score: 0,
      feedback: 'Error in grading process. Please review manually.',
      explanation: 'LLM API error occurred'
    };
  }
}

/**
 * Formats a prompt for the LLM to grade a submission
 */
function formatGradingPrompt(request: GradingRequest): string {
  return `
Please grade the following student submission:

ASSIGNMENT QUESTION:
\`\`\`html
${request.question}
\`\`\`

STUDENT SUBMISSION:
\`\`\`py
${request.studentSubmission}
\`\`\`

RUBRIC:
${request.rubric}

Please provide:
1. A numerical score out of ${request.maxPoints} points
2. Specific feedback for the student in Chinese
3. A brief explanation of your grading rationale

Format your response as:
SCORE: [numerical score]
FEEDBACK: [feedback for student]
EXPLANATION: [your grading rationale]
`;
}

/**
 * Parses the LLM response to extract the grade and feedback
 */
function parseGradingResponse(response: string, maxPoints: number): GradingResult {
  logger.info('Parsing LLM grading response');
  
  try {
    // Extract score
    const scoreMatch = response.match(/SCORE:\s*(\d+(\.\d+)?)/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    
    // Extract feedback
    const feedbackMatch = response.match(/FEEDBACK:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : '';
    
    // Extract explanation
    const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)$/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';
    
    // Ensure score is within valid range
    const validScore = Math.min(Math.max(0, score), maxPoints);
    
    return {
      score: validScore,
      feedback,
      explanation
    };
  } catch (error) {
    logger.error('Failed to parse LLM response:', error);
    
    // Return default values on parse error
    return {
      score: 0,
      feedback: 'Error parsing grading response. Please review manually.',
      explanation: 'Response parsing error'
    };
  }
}
