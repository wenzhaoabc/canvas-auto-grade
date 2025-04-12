import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create log file path with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(logDir, `autograde-${timestamp}.log`);

// Create write stream for logging to file
const logStream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf8' });

// Log levels
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Formats a log message with timestamp and level
 */
function formatLogMessage(level: LogLevel, message: string, ...args: any[]): string {
  const timestamp = new Date().toLocaleString();
  const formattedMessage = args.length > 0 ? util.format(message, ...args) : message;
  const levelLength = Math.max(level.length, 5); // 5 is the length of 'DEBUG'
  const paddedLevel = level.toUpperCase().padEnd(levelLength, ' ');
  return `[${timestamp}] [${paddedLevel}] ${formattedMessage}`;
}

/**
 * Writes a log message to console and log file
 */
function log(level: LogLevel, message: string, ...args: any[]): void {
  const formattedMessage = formatLogMessage(level, message, ...args);

  // Write to console
  switch (level) {
    case 'info':
      console.info(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    case 'error':
      console.error(formattedMessage);
      break;
    case 'debug':
      // Only log debug messages when in debug mode
      if (process.env.APP_DEBUG === 'true') {
        console.debug(formattedMessage);
      }
      break;
  }

  // Write to log file
  logStream.write(formattedMessage + '\n');
}

/**
 * Logger utility for consistent logging across the application
 */
export const logger = {
  info: (message: string, ...args: any[]) => log('info', message, ...args),
  warn: (message: string, ...args: any[]) => log('warn', message, ...args),
  error: (message: string, ...args: any[]) => log('error', message, ...args),
  debug: (message: string, ...args: any[]) => log('debug', message, ...args),

  // Close the log stream (call this when the application exits)
  close: () => {
    logStream.end();
  }
};

// Close log stream on process exit
process.on('exit', () => {
  logger.close();
});
