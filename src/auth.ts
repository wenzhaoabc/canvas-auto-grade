import { Page } from 'playwright';
import { config } from './config';
import { logger } from './utils/logger';

/**
 * Logs into Canvas using Tongji University's unified identity authentication
 * @param page Playwright page object
 * @returns Promise that resolves when login is complete
 */
export async function loginToCanvas(page: Page): Promise<void> {
  logger.info('Attempting to log in to Canvas');
  
  try {
    // Navigate to the Canvas login page
    await page.goto('https://canvas.tongji.edu.cn/login', { 
      waitUntil: 'load',
      timeout: config.timeouts.navigation
    });
    
    // Check if already logged in
    const alreadyLoggedIn = await page.evaluate(() => {
      return window.location.href.includes('/dashboard');
    });
    
    if (alreadyLoggedIn) {
      logger.info('Already logged in');
      return;
    }
    
    // Wait for redirect to the unified authentication system
    await page.waitForURL(url => url.href.includes('iam.tongji.edu.cn/idp/authcenter/ActionAuthChain'), 
      { timeout: config.timeouts.navigation });
    
    logger.info('Redirected to unified authentication system');
    
    // Fill student ID (username)
    await page.waitForSelector('#j_username', { timeout: config.timeouts.element });
    await page.fill('#j_username', config.credentials.username);
    
    // Fill password
    await page.waitForSelector('#j_password', { timeout: config.timeouts.element });
    await page.fill('#j_password', config.credentials.password);
    
    // Click login button - adjust selector based on actual page structure
    await page.click('#loginButton');
    
    // Wait for authentication to complete and redirect back to Canvas
    await page.waitForURL(url => url.href.includes('canvas.tongji.edu.cn'), 
      { timeout: config.timeouts.navigation });
    
    // Verify successful login
    const isLoggedIn = await page.evaluate(() => {
      return document.querySelector('#dashboard') !== null || 
             document.querySelector('.ic-Dashboard-header') !== null;
    });
    
    if (!isLoggedIn) {
      throw new Error('Login verification failed');
    }
    
    logger.info('Successfully logged in to Canvas through unified authentication');
  } catch (error) {
    logger.error('Login to Canvas failed:', error);
    throw new Error('Failed to login to Canvas: ' + (error instanceof Error ? error.message : String(error)));
  }
}
