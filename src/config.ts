/**
 * Application configuration loaded from environment variables with defaults
 */
export const config = {
  // Course and assignment identifiers
  courseId: process.env.COURSE_ID || '97701',
  assignmentId: process.env.ASSIGNMENT_ID || '82751',
  assignmentType: process.env.ASSIGNMENT_TYPE || 'single', // single or group

  // Browser settings
  headless: process.env.HEADLESS === 'true',
  slowMo: parseInt(process.env.SLOW_MO || '50'),
  viewport: {
    width: parseInt(process.env.VIEWPORT_WIDTH || '1920'),
    height: parseInt(process.env.VIEWPORT_HEIGHT || '1080')
  },

  // Canvas credentials
  credentials: {
    username: process.env.STUID || '',
    password: process.env.PASSWORD || ''
  },

  // LLM API configuration
  llm: {
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.3'),
    basePrompt: process.env.BASE_PROMPT ||
      'You are a teaching assistant grading programming assignments. ' +
      'Analyze the following student submission based on the assignment requirements. ' +
      'Provide a grade (out of the maximum points) and constructive feedback.' +
      'Comments should be concise, written in formal Chinese, and avoid any artificial tone or AI-generated patterns.'
  },

  // Timeouts for various operations (in milliseconds)
  timeouts: {
    navigation: parseInt(process.env.NAVIGATION_TIMEOUT || '30000'),
    element: parseInt(process.env.ELEMENT_TIMEOUT || '20000'),
    submission: parseInt(process.env.SUBMISSION_TIMEOUT || '30000')
  },

  // File paths
  downloadPath: process.env.DOWNLOAD_PATH || './downloads',

  // Grading settings
  defaultGrade: parseInt(process.env.DEFAULT_GRADE || '0'),

  // Debug mode
  debug: process.env.APP_DEBUG === 'true'
};
