import OpenAI from 'openai';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { AppError, ErrorCodes } from '../utils/errors';

export class EmbeddingService {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
    logger.info({ model: this.model }, 'OpenAI embedding service initialized');
  }

  /**
   * Generate embedding for a query string
   * Returns the embedding vector and the time taken
   */
  async generateEmbedding(query: string): Promise<{ embedding: number[]; timeMs: number }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: query,
        encoding_format: 'float'
      });

      const timeMs = Date.now() - startTime;
      
      if (!response.data || response.data.length === 0) {
        throw new AppError(
          ErrorCodes.EMBEDDING_SERVICE_ERROR.code,
          'Empty embedding response from OpenAI',
          ErrorCodes.EMBEDDING_SERVICE_ERROR.statusCode
        );
      }

      logger.info({ queryLength: query.length, timeMs }, 'Embedding generated');
      
      return {
        embedding: response.data[0].embedding,
        timeMs
      };
    } catch (error) {
      logger.error({ error, queryLength: query.length }, 'Failed to generate embedding');
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        ErrorCodes.EMBEDDING_SERVICE_ERROR.code,
        ErrorCodes.EMBEDDING_SERVICE_ERROR.message,
        ErrorCodes.EMBEDDING_SERVICE_ERROR.statusCode
      );
    }
  }
}
