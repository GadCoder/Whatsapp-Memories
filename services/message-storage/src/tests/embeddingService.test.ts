import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbeddingService } from '../services/embeddings/EmbeddingService';

const baseConfig = {
  provider: 'openai' as const,
  fallbackProvider: undefined,
  required: false,
  openai: {
    apiKey: '',
    model: 'text-embedding-3-small',
  },
  gemini: {
    apiKey: '',
    model: 'text-embedding-004',
  },
};

test('EmbeddingService enters degraded mode when provider credentials are missing', () => {
  const service = new EmbeddingService(baseConfig, false);

  assert.equal(service.isAvailable(), false);
  assert.equal(service.getDimensions(), 0);
  assert.match(service.getUnavailableReason() || '', /OPENAI_API_KEY is missing/);
});

test('EmbeddingService throws when embeddings are required and unavailable', () => {
  assert.throws(
    () => new EmbeddingService({ ...baseConfig, required: true }, false),
    /OPENAI_API_KEY is missing|Embeddings are required/
  );
});
