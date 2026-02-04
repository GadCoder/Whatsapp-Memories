export type ProviderType = 'openai' | 'gemini';

export interface Config {
  redis: {
    host: string;
    port: number;
  };
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  embedding: {
    provider: ProviderType;
    fallbackProvider?: ProviderType;
    openai: {
      apiKey: string;
      model: string;
    };
    gemini: {
      apiKey: string;
      model: string;
    };
  };
  debug: boolean;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  redis: {
    host: getEnvOrDefault('REDIS_HOST', 'localhost'),
    port: parseInt(getEnvOrDefault('REDIS_PORT', '6379'), 10),
  },
  postgres: {
    host: getEnvOrDefault('POSTGRES_HOST', 'localhost'),
    port: parseInt(getEnvOrDefault('POSTGRES_PORT', '5432'), 10),
    database: getEnvOrDefault('POSTGRES_DB', 'memories'),
    user: getEnvOrDefault('POSTGRES_USER', 'memories'),
    password: getEnvOrDefault('POSTGRES_PASSWORD', 'memories'),
  },
  embedding: {
    provider: (getEnvOrDefault('EMBEDDING_PROVIDER', 'openai') as ProviderType),
    fallbackProvider: process.env.EMBEDDING_FALLBACK_PROVIDER as ProviderType | undefined,
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: getEnvOrDefault('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: getEnvOrDefault('GEMINI_EMBEDDING_MODEL', 'text-embedding-004'),
    },
  },
  debug: getEnvOrDefault('DEBUG', 'false').toLowerCase() === 'true',
};
