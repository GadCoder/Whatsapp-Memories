import { Message } from 'whatsapp-web.js';
import whatsAppClient from './clients/whatsapp-client';
import { PublisherService } from './services/PublisherService';
import { FilterService } from './services/FilterService';
import { MessageProcessor } from './services/MessageProcessor';
import { config } from './config/config';
import { logger } from './utils/logger';

/**
 * Main WhatsApp Collector Service
 * Orchestrates message collection, filtering, processing, and publishing
 */
async function startCollector() {
  logger.info('========================================');
  logger.info('Starting WhatsApp Collector Service');
  logger.info('========================================');
  logger.info('Configuration', {
    redisHost: config.redis.host,
    redisPort: config.redis.port,
    filterMode: config.filter.mode,
    groupsFilter: config.filter.groupsFilter,
    debug: config.debug,
  });

  // Initialize services
  const publisher = new PublisherService();
  const filterService = new FilterService(config.filter);
  const messageProcessor = new MessageProcessor();

  // Connect to Redis
  try {
    await publisher.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis, exiting', { error });
    process.exit(1);
  }

  // Initialize WhatsApp client
  let isClientReady = false;
  try {
    await whatsAppClient.initialize();
    isClientReady = true;
    logger.info('WhatsApp client is ready, listening for messages...');
  } catch (error) {
    logger.error('Failed to initialize WhatsApp client, exiting', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    await publisher.disconnect();
    process.exit(1);
  }

  // Listen for messages (incoming and outgoing)
  // 'message_create' fires for all messages including ones sent by us
  whatsAppClient.client.on('message_create', async (message: Message) => {
    if (!isClientReady) {
      logger.warn('Message received but client not ready, ignoring');
      return;
    }

    try {
      const direction = message.fromMe ? 'outgoing' : 'incoming';
      logger.info(`Received ${direction} message from ${message.from}`);

      // Determine if message is from group/broadcast
      const isGroup = message.from.endsWith('@g.us');
      const isBroadcast = message.from.endsWith('@broadcast');

      // Apply filters
      const shouldSave = filterService.shouldSaveMessage(
        message.from,
        isGroup,
        isBroadcast
      );

      if (!shouldSave) {
        logger.info(`Message filtered out from ${message.from}`, {
          isGroup,
          isBroadcast,
        });
        return;
      }

      // Process message
      const processedMessage = await messageProcessor.processMessage(message);

      // Publish to Redis
      await publisher.publish(processedMessage);

      logger.info(`Message processed successfully`, {
        messageId: processedMessage.messageId,
        type: processedMessage.messageType,
        channel: processedMessage.messageType === 'text' 
          ? config.redis.channels.TEXT 
          : config.redis.channels.OTHER,
      });
    } catch (error) {
      logger.error('Error processing message', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        messageId: message.id._serialized,
        from: message.from,
      });
    }
  });

  logger.info('========================================');
  logger.info('WhatsApp Collector Service is running');
  logger.info('Waiting for messages...');
  logger.info('========================================');

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Disconnect publisher (will flush queue)
      await publisher.disconnect();
      
      // Destroy WhatsApp client
      await whatsAppClient.client.destroy();
      
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
  });
}

// Start the service
startCollector().catch((err) => {
  logger.error('Fatal error starting collector', { error: err });
  process.exit(1);
});
