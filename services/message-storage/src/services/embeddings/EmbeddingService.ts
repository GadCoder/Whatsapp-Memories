import { config } from '../../config/config';
import { IEmbeddingProvider, ProviderStats, EmbeddingResult } from './types';
import { createEmbeddingProvider } from './providers';
import { ProviderType } from '../../config/config';

type EmbeddingConfig = typeof config.embedding;

export class EmbeddingService {
  private primary: IEmbeddingProvider | null = null;
  private fallback?: IEmbeddingProvider;
  private stats: Map<string, ProviderStats>;
  private unavailableReason: string | null = null;

  constructor(
    private readonly embeddingConfig: EmbeddingConfig = config.embedding,
    private readonly debug: boolean = config.debug
  ) {
    this.primary = this.tryCreateProvider(this.embeddingConfig.provider, true);
    if (this.embeddingConfig.fallbackProvider) {
      this.fallback =
        this.tryCreateProvider(this.embeddingConfig.fallbackProvider, false) || undefined;
    }

    if (!this.primary && this.embeddingConfig.required) {
      throw new Error(
        this.unavailableReason ||
          'Embeddings are required but no valid embedding provider could be initialized'
      );
    }

    // Initialize stats
    this.stats = new Map();
    if (this.primary) {
      this.initStats(this.primary.name);
    }
    if (this.fallback) {
      this.initStats(this.fallback.name);
    }

    if (this.primary) {
      console.log(`[EmbeddingService] Primary provider: ${this.primary.name}`);
      console.log(`[EmbeddingService] Embedding dimensions: ${this.primary.dimensions}`);
    }
    if (this.fallback) {
      console.log(`[EmbeddingService] Fallback provider: ${this.fallback.name}`);
    }
    if (!this.primary) {
      console.warn(
        `[EmbeddingService] Embeddings unavailable: ${this.unavailableReason || 'unknown reason'}`
      );
    }
  }

  private tryCreateProvider(
    provider: ProviderType,
    isPrimary: boolean
  ): IEmbeddingProvider | null {
    if (provider === 'openai' && !this.embeddingConfig.openai.apiKey) {
      const message = '[EmbeddingService] OpenAI provider configured but OPENAI_API_KEY is missing';
      if (isPrimary) {
        this.unavailableReason = message;
      }
      console.warn(message);
      return null;
    }
    if (provider === 'gemini' && !this.embeddingConfig.gemini.apiKey) {
      const message = '[EmbeddingService] Gemini provider configured but GEMINI_API_KEY is missing';
      if (isPrimary) {
        this.unavailableReason = message;
      }
      console.warn(message);
      return null;
    }

    return createEmbeddingProvider(provider, {
      provider,
      openai: this.embeddingConfig.openai,
      gemini: this.embeddingConfig.gemini,
      debug: this.debug,
    });
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
    if (!this.primary) {
      throw new Error(
        this.unavailableReason || 'Embedding provider is unavailable in degraded mode'
      );
    }
    const primary = this.primary;

    // Try primary provider
    try {
      this.recordRequest(primary.name);
      const startTime = Date.now();
      
      const embedding = await this.retryWithBackoff(() => 
        primary.generate(text)
      );
      
      const latency = Date.now() - startTime;
      this.recordSuccess(primary.name, latency);
      
      return { embedding, provider: primary.name };
    } catch (primaryError) {
      this.recordFailure(primary.name);
      console.error(
        `[EmbeddingService] Primary provider ${primary.name} failed:`,
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
    if (!this.primary) {
      throw new Error(
        this.unavailableReason || 'Embedding provider is unavailable in degraded mode'
      );
    }
    const primary = this.primary;

    // Try primary provider
    try {
      this.recordRequest(primary.name);
      const startTime = Date.now();
      
      const embeddings = await this.retryWithBackoff(() => 
        primary.generateBatch(validTexts)
      );
      
      const latency = Date.now() - startTime;
      this.recordSuccess(primary.name, latency);
      
      return embeddings.map(embedding => ({
        embedding,
        provider: primary.name,
      }));
    } catch (primaryError) {
      this.recordFailure(primary.name);
      console.error(
        `[EmbeddingService] Primary provider ${primary.name} batch failed:`,
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
    return this.primary ? this.primary.dimensions : 0;
  }

  isAvailable(): boolean {
    return this.primary !== null;
  }

  getUnavailableReason(): string | null {
    return this.unavailableReason;
  }
}
