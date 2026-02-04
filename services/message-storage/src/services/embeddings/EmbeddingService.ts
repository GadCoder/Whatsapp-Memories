import { config } from '../../config/config';
import { IEmbeddingProvider, ProviderStats, EmbeddingResult } from './types';
import { createEmbeddingProvider } from './providers';

export class EmbeddingService {
  private primary: IEmbeddingProvider;
  private fallback?: IEmbeddingProvider;
  private stats: Map<string, ProviderStats>;

  constructor() {
    // Validate primary provider has API key
    if (config.embedding.provider === 'openai' && !config.embedding.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required when using OpenAI provider');
    }
    if (config.embedding.provider === 'gemini' && !config.embedding.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY is required when using Gemini provider');
    }

    // Create primary provider
    this.primary = createEmbeddingProvider(config.embedding.provider, {
      provider: config.embedding.provider,
      openai: config.embedding.openai,
      gemini: config.embedding.gemini,
      debug: config.debug,
    });

    // Create fallback provider if configured
    if (config.embedding.fallbackProvider) {
      if (config.embedding.fallbackProvider === 'openai' && !config.embedding.openai.apiKey) {
        console.warn('[EmbeddingService] Fallback provider OpenAI configured but no API key provided');
      } else if (config.embedding.fallbackProvider === 'gemini' && !config.embedding.gemini.apiKey) {
        console.warn('[EmbeddingService] Fallback provider Gemini configured but no API key provided');
      } else {
        this.fallback = createEmbeddingProvider(config.embedding.fallbackProvider, {
          provider: config.embedding.fallbackProvider,
          openai: config.embedding.openai,
          gemini: config.embedding.gemini,
          debug: config.debug,
        });
      }
    }

    // Initialize stats
    this.stats = new Map();
    this.initStats(this.primary.name);
    if (this.fallback) {
      this.initStats(this.fallback.name);
    }

    console.log(`[EmbeddingService] Primary provider: ${this.primary.name}`);
    if (this.fallback) {
      console.log(`[EmbeddingService] Fallback provider: ${this.fallback.name}`);
    }
    console.log(`[EmbeddingService] Embedding dimensions: ${this.primary.dimensions}`);
  }

  private initStats(provider: string): void {
    this.stats.set(provider, {
      provider,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      totalLatency: 0,
      avgLatency: 0,
      totalTokens: 0,
    });
  }

  private recordRequest(provider: string): void {
    const stats = this.stats.get(provider);
    if (stats) {
      stats.requestCount++;
    }
  }

  private recordSuccess(provider: string, latency: number, tokens: number = 0): void {
    const stats = this.stats.get(provider);
    if (stats) {
      stats.successCount++;
      stats.totalLatency += latency;
      stats.avgLatency = stats.totalLatency / stats.successCount;
      stats.totalTokens += tokens;
    }
  }

  private recordFailure(provider: string): void {
    const stats = this.stats.get(provider);
    if (stats) {
      stats.failureCount++;
    }
  }

  /**
   * Retry a function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(
            `[EmbeddingService] Attempt ${attempt}/${maxAttempts} failed, ` +
            `retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Generate embedding for a single text with automatic fallback
   */
  async generate(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Try primary provider
    try {
      this.recordRequest(this.primary.name);
      const startTime = Date.now();
      
      const embedding = await this.retryWithBackoff(() => 
        this.primary.generate(text)
      );
      
      const latency = Date.now() - startTime;
      this.recordSuccess(this.primary.name, latency);
      
      return { embedding, provider: this.primary.name };
    } catch (primaryError) {
      this.recordFailure(this.primary.name);
      console.error(
        `[EmbeddingService] Primary provider ${this.primary.name} failed:`,
        primaryError
      );
      
      // Try fallback provider if available
      if (this.fallback) {
        console.log(`[EmbeddingService] Trying fallback provider ${this.fallback.name}...`);
        
        try {
          this.recordRequest(this.fallback.name);
          const startTime = Date.now();
          
          const embedding = await this.retryWithBackoff(() => 
            this.fallback!.generate(text)
          );
          
          const latency = Date.now() - startTime;
          this.recordSuccess(this.fallback.name, latency);
          
          console.log(`[EmbeddingService] Fallback provider ${this.fallback.name} succeeded`);
          return { embedding, provider: this.fallback.name };
        } catch (fallbackError) {
          this.recordFailure(this.fallback.name);
          console.error(
            `[EmbeddingService] Fallback provider ${this.fallback.name} also failed:`,
            fallbackError
          );
          throw fallbackError;
        }
      }
      
      throw primaryError;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter(t => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      return [];
    }

    // Try primary provider
    try {
      this.recordRequest(this.primary.name);
      const startTime = Date.now();
      
      const embeddings = await this.retryWithBackoff(() => 
        this.primary.generateBatch(validTexts)
      );
      
      const latency = Date.now() - startTime;
      this.recordSuccess(this.primary.name, latency);
      
      return embeddings.map(embedding => ({
        embedding,
        provider: this.primary.name,
      }));
    } catch (primaryError) {
      this.recordFailure(this.primary.name);
      console.error(
        `[EmbeddingService] Primary provider ${this.primary.name} batch failed:`,
        primaryError
      );
      
      // Try fallback provider if available
      if (this.fallback) {
        console.log(
          `[EmbeddingService] Trying fallback provider ${this.fallback.name} for batch...`
        );
        
        try {
          this.recordRequest(this.fallback.name);
          const startTime = Date.now();
          
          const embeddings = await this.retryWithBackoff(() => 
            this.fallback!.generateBatch(validTexts)
          );
          
          const latency = Date.now() - startTime;
          this.recordSuccess(this.fallback.name, latency);
          
          console.log(`[EmbeddingService] Fallback provider ${this.fallback.name} batch succeeded`);
          return embeddings.map(embedding => ({
            embedding,
            provider: this.fallback!.name,
          }));
        } catch (fallbackError) {
          this.recordFailure(this.fallback.name);
          console.error(
            `[EmbeddingService] Fallback provider ${this.fallback.name} batch also failed:`,
            fallbackError
          );
          throw fallbackError;
        }
      }
      
      throw primaryError;
    }
  }

  /**
   * Get provider statistics
   */
  getStats(): ProviderStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get current provider dimensions
   */
  getDimensions(): number {
    return this.primary.dimensions;
  }
}
