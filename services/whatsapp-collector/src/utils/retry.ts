import { logger } from './logger';
import { RetryConfig } from '../types/message.types';

/**
 * Retry a function with exponential backoff
 * @param fn The async function to retry
 * @param options Retry configuration
 * @param context Optional context for logging
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryConfig,
  context?: string
): Promise<T> {
  let lastError: Error;
  let delay = options.initialDelay;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < options.maxRetries) {
        logger.warn(
          `Retry attempt ${attempt + 1}/${options.maxRetries} failed${context ? ` for ${context}` : ''}`,
          { error: lastError.message, nextDelay: delay }
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * options.backoffMultiplier, options.maxDelay);
      }
    }
  }

  throw lastError!;
}
