/**
 * Application configuration loaded from environment variables with defaults
 */
export const config = {
  // Course and assignment identifiers
  courseId: process.env.COURSE_ID || '97701',
  assignmentId: process.env.ASSIGNMENT_ID || '82751',
  assignmentType: process.env.ASSIGNMENT_TYPE || 'group', // 'single' or 'group'

  // LLM API configuration
  llm: {
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o',
    maxTokens: parseInt(process.env.MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.3'),
    basePrompt: process.env.BASE_PROMPT ||
      'Please grade the assignment in the tone of a university professor. ' +
      'Analyze the following student submission based on the assignment requirements. ' +
      'Provide a grade (out of the maximum points) and constructive comments.' +
      'Comments should be concise, written in formal Chinese, and avoid any artificial tone or AI-generated patterns.'
  },

  // File paths
  paths: {
    downloads: process.env.DOWNLOAD_PATH || './downloads',
    results: process.env.RESULTS_PATH || './results',
    rubrics: process.env.RUBRICS_PATH || './rubrics',
  },

  // Temp directory for storing files
  tempPath: process.env.TEMP_PATH || './temp',

  // Debug mode
  debug: process.env.APP_DEBUG === 'true'
};
