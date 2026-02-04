export type ProviderType = 'openai' | 'gemini';

export interface IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;        // Dimensions after padding (always 1536)
  readonly actualDimensions: number;  // Native dimensions before padding
  
  /**
   * Generate embedding for a single text
   * @param text - The text to embed
   * @returns Array of embedding values (always 1536 dimensions)
   */
  generate(text: string): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts in batch
   * @param texts - Array of texts to embed
   * @returns Array of embedding arrays (each 1536 dimensions)
   */
  generateBatch(texts: string[]): Promise<number[][]>;
}

export interface ProviderStats {
  provider: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalLatency: number;
  avgLatency: number;
  totalTokens: number;
}

export interface EmbeddingResult {
  embedding: number[];
  provider: string;
}
