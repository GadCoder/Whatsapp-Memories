import OpenAI from 'openai';
import { IEmbeddingProvider } from '../types';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  debug?: boolean;
}

export class OpenAIProvider implements IEmbeddingProvider {
  public readonly name = 'openai';
  public readonly dimensions = 1536;
  public readonly actualDimensions = 1536;

  private client: OpenAI;
  private model: string;
  private debug: boolean;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.debug = config.debug || false;

    if (this.debug) {
      console.log(`[OpenAIProvider] Initialized with model: ${this.model}`);
    }
  }

  async generate(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    const startTime = Date.now();

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      const latency = Date.now() - startTime;

      if (this.debug) {
        console.log(
          `[OpenAIProvider] Generated embedding: ${text.length} chars, ` +
          `${response.usage?.total_tokens || 0} tokens, ${latency}ms`
        );
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('[OpenAIProvider] Failed to generate embedding:', error);
      throw error;
    }
  }

  async generateBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const startTime = Date.now();

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      const latency = Date.now() - startTime;

      if (this.debug) {
        console.log(
          `[OpenAIProvider] Generated ${texts.length} embeddings in batch, ` +
          `${response.usage?.total_tokens || 0} tokens, ${latency}ms`
        );
      }

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('[OpenAIProvider] Failed to generate batch embeddings:', error);
      throw error;
    }
  }
}
