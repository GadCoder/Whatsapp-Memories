import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import { WhatsAppMessage, REDIS_CHANNELS } from '../types/message.types';

export type MessageHandler = (message: WhatsAppMessage) => Promise<void>;

export class SubscriberService {
  private client: RedisClientType | null = null;
  private handler: MessageHandler | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const url = `redis://${config.redis.host}:${config.redis.port}`;
    this.client = createClient({ url });

    this.client.on('error', (err) => {
      console.error('[Subscriber] Redis client error:', err);
    });

    this.client.on('reconnecting', () => {
      console.log('[Subscriber] Reconnecting to Redis...');
    });

    await this.client.connect();
    this.isConnected = true;
    console.log('[Subscriber] Connected to Redis');
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  async subscribe(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected. Call connect() first.');
    }

    if (!this.handler) {
      throw new Error('No message handler registered. Call onMessage() first.');
    }

    // Subscribe to all message channels
    for (const channel of REDIS_CHANNELS) {
      await this.client.subscribe(channel, async (payload, channelName) => {
        try {
          const message = this.parseMessage(payload);
          if (message) {
            if (config.debug) {
              console.log(`[Subscriber] Received message on ${channelName}:`, message.messageId);
            }
            await this.handler!(message);
          }
        } catch (error) {
          console.error(`[Subscriber] Error processing message from ${channelName}:`, error);
        }
      });
      console.log(`[Subscriber] Subscribed to channel: ${channel}`);
    }

    console.log('[Subscriber] Listening for messages on all channels');
  }

  private parseMessage(payload: string): WhatsAppMessage | null {
    try {
      const parsed = JSON.parse(payload);
      
      // Validate required fields
      // Note: text can be empty string for media-only messages
      if (!parsed.messageId || !parsed.chatId || parsed.text === undefined) {
        console.warn('[Subscriber] Invalid message format, missing required fields:', {
          hasMessageId: !!parsed.messageId,
          hasChatId: !!parsed.chatId,
          hasText: parsed.text !== undefined,
          textValue: parsed.text,
          keys: Object.keys(parsed),
          payload: payload.substring(0, 300),
        });
        return null;
      }

      return parsed as WhatsAppMessage;
    } catch (error) {
      console.error('[Subscriber] Failed to parse message:', error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.unsubscribe();
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      console.log('[Subscriber] Disconnected from Redis');
    }
  }
}
