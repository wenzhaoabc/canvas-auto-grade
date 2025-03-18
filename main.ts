import 'dotenv/config';
import { chromium, Browser } from 'playwright';
import { loginToCanvas } from './src/auth';
import { processAssignment } from './src/assignment-processor';
import { config } from './src/config';
import { logger } from './src/utils/logger';


let browser: Browser | null = null;

/**
 * Main function that runs the Canvas auto-review process
 */
async function main() {
  logger.info('Starting Canvas auto-review process');

  try {
    // Initialize browser with configured options
    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    });

    // Create page with configured viewport
    const page = await browser.newPage({
      viewport: { width: config.viewport.width, height: config.viewport.height }
    });

    // Login to Canvas
    await loginToCanvas(page);

    // Process the specified assignment for all students
    await processAssignment(
      page,
      config.courseId,
      config.assignmentId
    );

    logger.info('Auto-review process completed successfully');
  } catch (error) {
    logger.error('Error in auto-review process:', error);
  } finally {
    // Ensure browser is closed even if an error occurs
    if (browser) {
      await browser.close();
      browser = null;
      logger.info('Browser closed');
    }
  }
}

// Execute the main function
main().catch(error => {
  logger.error('Unhandled error in main function:', error);
  process.exit(1);
});

