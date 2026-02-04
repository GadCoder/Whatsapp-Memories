import { GoogleGenerativeAI } from '@google/generative-ai';
import { IEmbeddingProvider } from '../types';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  debug?: boolean;
}

export class GeminiProvider implements IEmbeddingProvider {
  public readonly name = 'gemini';
  public readonly dimensions = 1536;        // Padded dimensions
  public readonly actualDimensions = 768;   // Native Gemini dimensions

  private client: GoogleGenerativeAI;
  private model: string;
  private debug: boolean;

  constructor(config: GeminiConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model;
    this.debug = config.debug || false;

    if (this.debug) {
      console.log(`[GeminiProvider] Initialized with model: ${this.model}`);
    }
  }

  /**
   * Pad 768-dimensional embedding to 1536 dimensions by appending zeros
   */
  private padEmbedding(embedding: number[]): number[] {
    if (embedding.length >= this.dimensions) {
      return embedding.slice(0, this.dimensions);
    }
    
    const padding = new Array(this.dimensions - embedding.length).fill(0);
    return [...embedding, ...padding];
  }

  async generate(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    const startTime = Date.now();

    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      
      const result = await model.embedContent(text);

      const latency = Date.now() - startTime;

      if (!result.embedding || !result.embedding.values) {
        throw new Error('No embedding returned from Gemini API');
      }

      const embedding = this.padEmbedding(result.embedding.values);

      if (this.debug) {
        console.log(
          `[GeminiProvider] Generated embedding: ${text.length} chars, ` +
          `${this.actualDimensions}D→${this.dimensions}D, ${latency}ms`
        );
      }

      return embedding;
    } catch (error) {
      console.error('[GeminiProvider] Failed to generate embedding:', error);
      throw error;
    }
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const startTime = Date.now();

    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      
      // Gemini's embedContent doesn't support batch processing directly
      // So we'll process sequentially (can be optimized with Promise.all if needed)
      const embeddings: number[][] = [];
      
      for (const text of texts) {
        if (!text || text.trim().length === 0) {
          // Skip empty texts, use zero vector
          embeddings.push(new Array(this.dimensions).fill(0));
          continue;
        }

        const result = await model.embedContent(text);

        if (!result.embedding || !result.embedding.values) {
          throw new Error('No embedding returned from Gemini API');
        }

        embeddings.push(this.padEmbedding(result.embedding.values));
      }

      const latency = Date.now() - startTime;

      if (this.debug) {
        console.log(
          `[GeminiProvider] Generated ${texts.length} embeddings in batch, ` +
          `${this.actualDimensions}D→${this.dimensions}D each, ${latency}ms`
        );
      }

      return embeddings;
    } catch (error) {
      console.error('[GeminiProvider] Failed to generate batch embeddings:', error);
      throw error;
    }
  }
}
