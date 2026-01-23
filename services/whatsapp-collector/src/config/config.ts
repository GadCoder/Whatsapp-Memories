import { FilterConfig, RetryConfig, QueueConfig } from '../types/message.types';

export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
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
    contacts: process.env.FILTER_CONTACTS?.split(',').map((c) => c.trim()) || [],
    groupsFilter: (process.env.FILTER_GROUPS || 'include') as
      | 'include'
      | 'exclude'
      | 'only',
    includeBroadcast: process.env.FILTER_BROADCAST === 'true',
  } as FilterConfig,

  retry: {
    maxRetries: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3'),
    initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY || '1000'),
    maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '10000'),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
  } as RetryConfig,

  queue: {
    maxSize: parseInt(process.env.QUEUE_MAX_SIZE || '1000'),
    flushInterval: parseInt(process.env.QUEUE_FLUSH_INTERVAL || '60000'),
  } as QueueConfig,

  debug: process.env.DEBUG === 'true',
};
