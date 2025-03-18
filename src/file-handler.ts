import { Page, Frame } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { logger } from './utils/logger';
import { formatDateTime } from './utils/tools';
import { config } from './config';

// Convert fs functions to Promise-based
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);

/**
 * Extracts file content from Canvas preview iframe
 * @param page Playwright page object
 * @param fileLink URL of the file link to click
 * @param fileName Original file name
 * @param studentId Student ID to use in the saved file name
 * @returns Object containing the file content and path where it's saved
 */
export async function extractFileContent(
  page: Page,
  fileLink: string,
  fileName: string,
  studentId: string
): Promise<{ content: string; filePath: string }> {
  logger.info(`Extracting file content: ${fileName} for student ${studentId}`);

  try {
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(config.downloadPath)) {
      await mkdir(config.downloadPath, { recursive: true });
    }

    // Generate a unique file name based on student ID and timestamp
    const timestamp = formatDateTime(new Date());
    const fileExt = path.extname(fileName);
    const baseFileName = path.basename(fileName, fileExt);
    const safeFileName = `${baseFileName}_${studentId}_${timestamp}${fileExt}`;
    const filePath = path.join(config.downloadPath, safeFileName);

    // Get the current iframe
    const frameElement = await page.$('iframe[id="speedgrader_iframe"]');
    if (!frameElement) {
      throw new Error("Couldn't find the speedgrader iframe");
    }

    const frame = await frameElement.contentFrame();
    if (!frame) {
      throw new Error("Couldn't access iframe content");
    }

    // Store the current URL to help with navigation back
    const initialUrl = frame.url();
    logger.debug(`Current iframe URL before clicking file link: ${initialUrl}`);

    // Find the file link element
    const fileLinkElement = await frame.$(`a[href="${fileLink}"]`);
    if (!fileLinkElement) {
      throw new Error(`Couldn't find file link for ${fileName}`);
    }

    logger.debug(`Clicking on file link to open preview: ${fileName}`);

    // Click the file link to open the preview
    await fileLinkElement.click();

    // Wait for the preview to load
    await frame.waitForTimeout(1000);

    // Extract content based on file type
    let content = '';

    // Check file extension to determine extraction method
    if (['.py', '.js', '.ts', '.txt', '.md', '.html', '.css', '.json', '.c', '.cpp', '.java'].includes(fileExt.toLowerCase())) {
      // Handle text-based files
      content = await extractTextContent(frame, fileExt.toLowerCase());
    } else {
      // For other file types, try to get content from the preview or return a placeholder
      content = await extractGenericContent(frame, fileExt);
    }

    if (content.trim() === '') {
      throw new Error(`Could not extract content from file preview for ${fileName}`);
    }

    // Save the content to file for reference
    await writeFile(filePath, content);
    logger.info(`File content extracted and saved to: ${filePath}`);

    // Navigate back using browser's back button
    logger.debug('Navigating back to previous page using browser back button');

    try {
      // Try using JavaScript history API first
      await frame.evaluate(() => {
        window.history.back();
        return true;
      });

      // Wait for navigation to complete
      await frame.waitForTimeout(1500);

      // Check if we navigated back successfully
      const currentUrl = frame.url();
      if (currentUrl === initialUrl || currentUrl.includes('quiz_submissions')) {
        logger.debug('Successfully navigated back to the original page');
      } else {
        // If JS history navigation failed, try browser keyboard shortcut for back
        logger.debug('History navigation may not have worked, trying keyboard shortcut');
        await page.keyboard.press('Alt+ArrowLeft');
        await frame.waitForTimeout(1500);

        // If still not at the expected URL, try explicit navigation as a last resort
        if (frame.url() !== initialUrl && !frame.url().includes('quiz_submissions')) {
          logger.warn('Browser back navigation failed, falling back to direct URL navigation');
          await frame.goto(initialUrl, { waitUntil: 'domcontentloaded' });
          await frame.waitForTimeout(1000);
        }
      }
    } catch (navError) {
      logger.error('Error during back navigation:', navError);
      // Last resort: try direct navigation
      await frame.goto(initialUrl, { waitUntil: 'domcontentloaded' });
      await frame.waitForTimeout(1000);
    }

    return { content, filePath };
  } catch (error) {
    logger.error('Error extracting file content:', error);
    throw new Error(`Failed to extract file content: ${fileName}`);
  }
}

/**
 * Extracts text content from text-based file previews
 */
async function extractTextContent(frame: Frame, fileExt: string): Promise<string> {
  logger.debug(`Extracting text content for ${fileExt} file`);

  // Try different selectors based on Canvas preview format
  const contentSelectors = [
    'pre', // Common for code
    'code',
    '.file-content',
    '.preview',
    '.file-preview',
    '.content',
    '#content',
    '.preview-content',
    // Canvas-specific selectors
    '.show-content',
    '.canvas_file_content',
    '.file-upload-submission',
    // Specific for code files
    '.CodeMirror-code',
    '.CodeMirror',
    '.highlight'
  ];

  for (const selector of contentSelectors) {
    try {
      const element = await frame.$(selector);
      if (element) {
        const content = await element.textContent() || '';
        if (content.trim()) {
          logger.debug(`Found content using selector: ${selector}`);
          return content;
        }
      }
    } catch (error) {
      continue; // Try next selector
    }
  }

  // Fallback: Get all visible text content from the body
  logger.debug('Using fallback method to extract text content');
  return await frame.evaluate(() => {
    // Remove header, nav, and other UI elements
    const uiElements = document.querySelectorAll('header, nav, .ui-menu, .ui-dialog');
    uiElements.forEach(el => el.remove());

    // Get remaining text
    return document.body.innerText;
  });
}

/**
 * Extracts content from generic file previews
 */
async function extractGenericContent(frame: Frame, fileExt: string): Promise<string> {
  logger.debug(`Extracting generic content for ${fileExt} file`);

  // Try to detect file preview type
  const isImage = await frame.$('img.preview-thumbnail, img.preview-image');
  if (isImage) {
    return `[This is an image file with extension ${fileExt}. Content extraction not supported.]`;
  }

  const isPdf = await frame.$('iframe[src*="pdf"], object[type="application/pdf"]');
  if (isPdf) {
    return `[This is a PDF file. Content extraction not supported.]`;
  }

  const isDoc = await frame.$('.office-365-iframe, .google-docs-iframe');
  if (isDoc) {
    return `[This is a document file with extension ${fileExt}. Content extraction not supported.]`;
  }

  // Check if there's any textual content we can extract
  try {
    const bodyText = await frame.$eval('body', el => {
      // Remove UI elements
      const uiElements = document.querySelectorAll('header, nav, footer, .ui-menu, .ui-dialog');
      const bodyClone = el.cloneNode(true) as HTMLElement;

      Array.from(bodyClone.querySelectorAll('header, nav, footer, .ui-menu, .ui-dialog'))
        .forEach(el => el.remove());

      return bodyClone.innerText.trim();
    });

    if (bodyText.length > 100) { // If there's substantial text content
      return bodyText;
    }
  } catch (error) {
    // Ignore error and continue
  }

  return `[This is a file with extension ${fileExt}. Content extraction not supported.]`;
}

/**
 * Checks if a file can be previewed in Canvas
 * @param fileName The name of the file
 * @returns Boolean indicating if the file is previewable
 */
export function isPreviewableFile(fileName: string): boolean {
  const fileExt = path.extname(fileName).toLowerCase();

  // List of extensions that can typically be previewed in Canvas
  const previewableExtensions = [
    // Text and code files
    '.txt', '.md', '.py', '.js', '.ts', '.html', '.css', '.json', '.c', '.cpp', '.java',
    '.rb', '.php', '.sh', '.xml', '.yml', '.yaml', '.csv',

    // Document files that might have preview support
    '.pdf',

    // Image files
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp'
  ];

  return previewableExtensions.includes(fileExt);
}
