import { config } from '../config/config';

/**
 * Simple console logger with timestamps and levels
 * Can be replaced with Winston/Pino later for more advanced logging
 */
export const logger = {
  info: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[INFO] ${timestamp} - ${message}${metaStr}`);
  },

  error: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.error(`[ERROR] ${timestamp} - ${message}${metaStr}`);
  },

  warn: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`[WARN] ${timestamp} - ${message}${metaStr}`);
  },

  debug: (message: string, meta?: any) => {
    if (config.debug) {
      const timestamp = new Date().toISOString();
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      console.debug(`[DEBUG] ${timestamp} - ${message}${metaStr}`);
    }
  },
};
