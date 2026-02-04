import { config } from './config/config';
import { initializeDatabase, closeDatabase } from './database/connection';
import { SubscriberService } from './services/SubscriberService';
import { EmbeddingService } from './services/embeddings/EmbeddingService';
import { StorageService } from './services/StorageService';
import { WhatsAppMessage } from './types/message.types';

class MessageStorageService {
  private subscriber: SubscriberService;
  private embedding: EmbeddingService;
  private storage: StorageService;
  private messageCount = 0;
  private errorCount = 0;

  constructor() {
    this.subscriber = new SubscriberService();
    this.embedding = new EmbeddingService();
    this.storage = new StorageService();
  }

  async start(): Promise<void> {
    console.log('='.repeat(50));
    console.log('Message Storage Service');
    console.log('='.repeat(50));
    console.log(`Debug mode: ${config.debug}`);
    console.log(`Primary embedding provider: ${config.embedding.provider}`);
    if (config.embedding.fallbackProvider) {
      console.log(`Fallback embedding provider: ${config.embedding.fallbackProvider}`);
    }
    console.log('');

    try {
      // Initialize database
      console.log('[Startup] Initializing database...');
      await initializeDatabase();
      await this.storage.initialize();

      // Connect to Redis
      console.log('[Startup] Connecting to Redis...');
      await this.subscriber.connect();

      // Register message handler
      this.subscriber.onMessage(this.handleMessage.bind(this));

      // Start listening
      await this.subscriber.subscribe();

      console.log('');
      console.log('[Startup] Service started successfully');
      console.log('[Startup] Waiting for messages...');
      console.log('');

      // Periodic stats logging
      this.startStatsReporter();

    } catch (error) {
      console.error('[Startup] Failed to start service:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  private async handleMessage(message: WhatsAppMessage): Promise<void> {
    try {
      // Generate embedding for the message text
      let embedding: number[] | null = null;
      let embeddingProvider: string | null = null;
      
      if (message.text && message.text.trim().length > 0) {
        try {
          const result = await this.embedding.generate(message.text);
          embedding = result.embedding;
          embeddingProvider = result.provider;
        } catch (embeddingError) {
          console.error(`[Handler] Failed to generate embedding for ${message.messageId}:`, embeddingError);
          // Continue without embedding - we still want to store the message
        }
      }

      // Save to database with provider info
      await this.storage.saveMessage(message, embedding, embeddingProvider);
      
      this.messageCount++;
      
      if (config.debug) {
        const embeddingStatus = embedding 
          ? `with ${embeddingProvider} embedding` 
          : 'without embedding';
        console.log(`[Handler] Processed message ${message.messageId} ${embeddingStatus}`);
      }

    } catch (error) {
      this.errorCount++;
      console.error(`[Handler] Failed to process message ${message.messageId}:`, error);
    }
  }

  private startStatsReporter(): void {
    // Log stats every 5 minutes
    setInterval(async () => {
      try {
        const totalMessages = await this.storage.getMessageCount();
        const embeddedMessages = await this.storage.getEmbeddedMessageCount();
        const providerStats = await this.storage.getEmbeddingStatsByProvider();
        const embeddingPerformance = this.embedding.getStats();
        
        console.log('[Stats] -----------------------------------------');
        console.log(`[Stats] Session: ${this.messageCount} messages processed, ${this.errorCount} errors`);
        console.log(`[Stats] Database: ${totalMessages} total messages, ${embeddedMessages} with embeddings`);
        
        if (providerStats.size > 0) {
          console.log('[Stats] Embeddings by provider:');
          providerStats.forEach((count, provider) => {
            console.log(`[Stats]   ${provider}: ${count} messages`);
          });
        }
        
        if (embeddingPerformance.length > 0) {
          console.log('[Stats] Provider performance:');
          embeddingPerformance.forEach(stat => {
            const successRate = stat.requestCount > 0 
              ? ((stat.successCount / stat.requestCount) * 100).toFixed(1)
              : '0.0';
            console.log(
              `[Stats]   ${stat.provider}: ${stat.successCount}/${stat.requestCount} requests ` +
              `(${successRate}% success), ${stat.avgLatency.toFixed(0)}ms avg`
            );
          });
        }
        
        console.log('[Stats] -----------------------------------------');
      } catch (error) {
        console.error('[Stats] Failed to get stats:', error);
      }
    }, 5 * 60 * 1000);
  }

  async shutdown(): Promise<void> {
    console.log('[Shutdown] Shutting down...');
    
    try {
      await this.subscriber.disconnect();
      await closeDatabase();
      console.log('[Shutdown] Cleanup complete');
    } catch (error) {
      console.error('[Shutdown] Error during cleanup:', error);
    }
  }
}

// Main entry point
const service = new MessageStorageService();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Signal] Received SIGINT');
  await service.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Signal] Received SIGTERM');
  await service.shutdown();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Error] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Error] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the service
service.start().catch((error) => {
  console.error('[Fatal] Failed to start service:', error);
  process.exit(1);
});
