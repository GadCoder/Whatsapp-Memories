import { createClient, RedisClientType } from 'redis';
import { WhatsAppMessage, MessageType } from '../types/message.types';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { DeadLetterReason, writeDeadLetterRecord } from './deadLetter';

/**
 * Service for publishing messages to Redis with retry and queue support
 * Implements 3-tier error handling: log -> retry -> queue
 */
export class PublisherService {
  private client: RedisClientType;
  private failedQueue: Array<{ channel: string; payload: string }> = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
    });

    // Handle Redis errors
    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Publisher connected to Redis', {
        host: config.redis.host,
        port: config.redis.port,
      });

      // Start queue flush interval
      this.startQueueFlush();
      await this.logDeadLetterRecoveryHint();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  /**
   * Publish a message to the appropriate Redis channel
   * Tier 1: Try to publish
   * Tier 2: Retry with exponential backoff
   * Tier 3: Queue locally if all retries fail
   */
  async publish(message: WhatsAppMessage): Promise<void> {
    const channel = this.getChannelForMessageType(message.messageType);
    const payload = JSON.stringify(message);

    try {
      // Tier 1 & 2: Try with retries
      await retryWithBackoff(
        () => this.client.publish(channel, payload),
        config.retry,
        `publish to ${channel}`
      );

      logger.info(`Published message to ${channel}`, {
        messageId: message.messageId,
        from: message.from,
        type: message.messageType,
      });
    } catch (error) {
      // Tier 3: Queue locally
      logger.error(`Failed to publish after retries, queuing locally`, {
        error: (error as Error).message,
        messageId: message.messageId,
        queueSize: this.failedQueue.length + 1,
      });

      if (this.failedQueue.length < config.queue.maxSize) {
        this.failedQueue.push({ channel, payload });
        logger.info(`Message queued (${this.failedQueue.length}/${config.queue.maxSize})`);
      } else {
        logger.error(`Queue is full! Dropping message`, {
          messageId: message.messageId,
          queueSize: this.failedQueue.length,
        });
        await this.writeToDeadLetterQueue(channel, payload, 'queue-full');
      }
    }
  }

  /**
   * Get the Redis channel name for a given message type
   */
  private getChannelForMessageType(type: MessageType): string {
    const channelMap: Record<MessageType, string> = {
      text: config.redis.channels.TEXT,
      image: config.redis.channels.IMAGE,
      video: config.redis.channels.VIDEO,
      audio: config.redis.channels.AUDIO,
      document: config.redis.channels.DOCUMENT,
      other: config.redis.channels.OTHER,
    };
    return channelMap[type];
  }

  /**
   * Start periodic queue flush
   */
  private startQueueFlush(): void {
    this.flushInterval = setInterval(async () => {
      if (this.failedQueue.length > 0 && this.isConnected) {
        logger.info(`Attempting to flush queue (${this.failedQueue.length} messages)`);
        await this.flushQueue();
      }
    }, config.queue.flushInterval);

    logger.debug('Queue flush interval started', {
      interval: config.queue.flushInterval,
    });
  }

  /**
   * Attempt to flush queued messages
   */
  private async flushQueue(): Promise<void> {
    const toFlush = [...this.failedQueue];
    this.failedQueue = [];

    let successCount = 0;
    let failCount = 0;

    for (const item of toFlush) {
      try {
        await this.client.publish(item.channel, item.payload);
        successCount++;
        logger.debug(`Successfully flushed queued message to ${item.channel}`);
      } catch (error) {
        failCount++;
        logger.error(`Failed to flush message, re-queuing`, {
          error: (error as Error).message,
        });
        if (this.failedQueue.length < config.queue.maxSize) {
          this.failedQueue.push(item);
        } else {
          await this.writeToDeadLetterQueue(item.channel, item.payload, 'flush-requeue-full');
        }
      }
    }

    if (successCount > 0 || failCount > 0) {
      logger.info(`Queue flush complete`, {
        success: successCount,
        failed: failCount,
        remaining: this.failedQueue.length,
      });
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      logger.debug('Queue flush interval stopped');
    }

    // Try to flush remaining messages before disconnecting
    if (this.failedQueue.length > 0) {
      logger.info(`Flushing ${this.failedQueue.length} queued messages before shutdown`);
      await this.flushQueue();

      if (this.failedQueue.length > 0) {
        logger.warn(`${this.failedQueue.length} messages could not be flushed and will be lost`);
        const remaining = [...this.failedQueue];
        this.failedQueue = [];
        for (const item of remaining) {
          await this.writeToDeadLetterQueue(item.channel, item.payload, 'shutdown-unflushed');
        }
      }
    }

    try {
      await this.client.disconnect();
      logger.info('Publisher disconnected from Redis');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
    }
  }

  private async logDeadLetterRecoveryHint(): Promise<void> {
    logger.info('Dead-letter path configured for failed publish records', {
      deadLetterPath: config.queue.deadLetterPath,
    });
  }

  private async writeToDeadLetterQueue(
    channel: string,
    payload: string,
    reason: DeadLetterReason
  ): Promise<void> {
    try {
      const deadLetterPath = config.queue.deadLetterPath;
      await writeDeadLetterRecord(deadLetterPath, channel, payload, reason);
      let messageId: string | undefined;
      try {
        messageId = (JSON.parse(payload) as { messageId?: string }).messageId;
      } catch {
        messageId = undefined;
      }
      logger.warn('Message persisted to dead-letter storage', {
        reason,
        channel,
        messageId,
        deadLetterPath,
      });
    } catch (error) {
      logger.error('Failed to persist message to dead-letter storage', {
        reason,
        channel,
        error: (error as Error).message,
      });
    }
  }
}
