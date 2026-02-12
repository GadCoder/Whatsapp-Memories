export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Invalid or missing API token', statusCode: 401 },
  RATE_LIMITED: { code: 'RATE_LIMITED', message: 'Too many requests', statusCode: 429 },
  INVALID_QUERY: { code: 'INVALID_QUERY', message: 'Query cannot be empty', statusCode: 400 },
  INVALID_FILTER: { code: 'INVALID_FILTER', message: 'Invalid filter parameter', statusCode: 400 },
  EMBEDDING_SERVICE_ERROR: { code: 'EMBEDDING_SERVICE_ERROR', message: 'Unable to generate embedding', statusCode: 503 },
  DATABASE_ERROR: { code: 'DATABASE_ERROR', message: 'Database error', statusCode: 503 },
  DECRYPTION_ERROR: { code: 'DECRYPTION_ERROR', message: 'Failed to decrypt message', statusCode: 500 },
  INDEX_MISSING: { code: 'INDEX_MISSING', message: 'pgvector index not found', statusCode: 503 },
  UNHEALTHY: { code: 'UNHEALTHY', message: 'Service unhealthy', statusCode: 503 }
} as const;
