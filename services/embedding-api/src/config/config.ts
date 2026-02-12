import { logger } from '../utils/logger';

function validateEnv(): void {
  // Validate API_TOKEN
  if (!process.env.API_TOKEN || process.env.API_TOKEN.length < 64) {
    throw new Error('API_TOKEN must be set and at least 64 characters');
  }

  // Validate ENCRYPTION_KEY
  if (!process.env.ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (256 bits)');
  }

  // Validate OPENAI_API_KEY
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required');
  }

  logger.info('Environment validation passed');
}

// Validate on module load
validateEnv();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3002', 10),
    host: process.env.HOST || '0.0.0.0'
  },
  database: {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'memories',
    user: process.env.POSTGRES_USER || 'memories',
    password: process.env.POSTGRES_PASSWORD || 'memories',
    poolSize: parseInt(process.env.PG_POOL_SIZE || '10', 10),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY!
  },
  auth: {
    apiToken: process.env.API_TOKEN!
  },
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '60', 10),
    timeWindow: '1 minute'
  }
} as const;
