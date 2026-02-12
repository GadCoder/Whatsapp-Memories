import { FilterConfig, RetryConfig, QueueConfig } from '../types/message.types';
import { parseFilterContacts } from './filterContacts';

function parseIntEnv(key: string, fallback: string): number {
  return parseInt(process.env[key] || fallback, 10);
}

const { validContacts, invalidContacts } = parseFilterContacts(process.env.FILTER_CONTACTS);
const strictFilterValidation = process.env.FILTER_STRICT_VALIDATION === 'true';

if (strictFilterValidation && invalidContacts.length > 0) {
  throw new Error(
    `Invalid FILTER_CONTACTS entries: ${invalidContacts.join(', ')}. ` +
      'Expected WhatsApp IDs ending with @c.us, @g.us, or @broadcast.'
  );
}

export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseIntEnv('REDIS_PORT', '6379'),
    channels: {
      TEXT: 'memories:text:saved',
      IMAGE: 'memories:image:saved',
      VIDEO: 'memories:video:saved',
      AUDIO: 'memories:audio:saved',
      DOCUMENT: 'memories:document:saved',
      OTHER: 'memories:other:saved',
    } as const,
  },

  filter: {
    mode: (process.env.FILTER_MODE || 'all') as 'all' | 'allowlist' | 'blocklist',
    contacts: validContacts,
    groupsFilter: (process.env.FILTER_GROUPS || 'include') as
      | 'include'
      | 'exclude'
      | 'only',
    includeBroadcast: process.env.FILTER_BROADCAST === 'true',
  } as FilterConfig,

  filterValidation: {
    strict: strictFilterValidation,
    invalidContacts,
  },

  retry: {
    maxRetries: parseIntEnv('RETRY_MAX_ATTEMPTS', '3'),
    initialDelay: parseIntEnv('RETRY_INITIAL_DELAY', '1000'),
    maxDelay: parseIntEnv('RETRY_MAX_DELAY', '10000'),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
  } as RetryConfig,

  queue: {
    maxSize: parseIntEnv('QUEUE_MAX_SIZE', '1000'),
    flushInterval: parseIntEnv('QUEUE_FLUSH_INTERVAL', '60000'),
    deadLetterPath:
      process.env.QUEUE_DEAD_LETTER_PATH || '/usr/src/app/data/publisher-dead-letter.ndjson',
  } as QueueConfig & { deadLetterPath: string },

  dedupe: {
    windowMs: parseIntEnv('MESSAGE_DEDUPE_WINDOW_MS', '600000'),
  },

  debug: process.env.DEBUG === 'true',
};
