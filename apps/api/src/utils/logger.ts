/**
 * Simple logger for Runic Protocol
 * In production, replace with a proper logging library like pino or winston
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const colors = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

function shouldLog(level: LogLevel): boolean {
  return logLevelPriority[level] >= logLevelPriority[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: object): string {
  const timestamp = new Date().toISOString();
  const color = colors[level];
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}]${colors.reset}`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: object) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: object) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: object) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, meta?: object | Error) {
    if (shouldLog('error')) {
      const errorMeta = meta instanceof Error 
        ? { error: meta.message, stack: meta.stack }
        : meta;
      console.error(formatMessage('error', message, errorMeta));
    }
  },

  // Special log for Runic events
  runic(event: string, data?: object) {
    const timestamp = new Date().toISOString();
    console.log(`\x1b[35m[${timestamp}] [RUNIC] ⚡ ${event}${colors.reset}`, data ? JSON.stringify(data) : '');
  },
};

export default logger;






