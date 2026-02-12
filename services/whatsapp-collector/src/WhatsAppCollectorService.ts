import { Message } from 'whatsapp-web.js';
import whatsAppClient from './clients/whatsapp-client';
import { PublisherService } from './services/PublisherService';
import { FilterService } from './services/FilterService';
import { MessageProcessor } from './services/MessageProcessor';
import { config } from './config/config';
import { logger } from './utils/logger';
import { MessageDeduplicator } from './utils/deduplication';

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
  if (config.filterValidation.invalidContacts.length > 0) {
    logger.warn('FILTER_CONTACTS has invalid identifiers', {
      invalidContacts: config.filterValidation.invalidContacts,
      strictValidation: config.filterValidation.strict,
      expectedSuffixes: ['@c.us', '@g.us', '@broadcast'],
    });
  }

  // Initialize services
  const publisher = new PublisherService();
  const filterService = new FilterService(config.filter);
  const messageProcessor = new MessageProcessor();
  const deduplicator = new MessageDeduplicator(config.dedupe.windowMs);
  let isShuttingDown = false;

  // Connect to Redis
  try {
    await publisher.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis, exiting', { error });
    process.exit(1);
  }

  // Initialize WhatsApp client
  let isClientReady = false;
  
  // Helper function to handle messages
  const handleMessage = async (message: Message, eventType: string) => {
    if (isShuttingDown) {
      return;
    }
    const messageId = message.id._serialized;
    logger.info(`${eventType} event fired!`, { messageId });

    if (!deduplicator.shouldProcess(messageId)) {
      logger.debug('Skipping duplicate message event', { messageId, eventType });
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
  };

  // Set up message listeners BEFORE initializing (this is critical!)
  logger.info('Setting up message event listeners...');
  
  // message_create fires for all messages (incoming and outgoing)
  whatsAppClient.client.on('message_create', async (message: Message) => {
    await handleMessage(message, 'message_create');
  });
  
  // message fires only for incoming messages
  whatsAppClient.client.on('message', async (message: Message) => {
    await handleMessage(message, 'message');
  });

  // Wait for the ready event to mark client as ready
  whatsAppClient.client.on('ready', () => {
    isClientReady = true;
    logger.info('READY EVENT FIRED - Client marked as ready');
  });
  
  // Also mark as ready on authenticated as fallback
  whatsAppClient.client.on('authenticated', () => {
    logger.info('AUTHENTICATED EVENT FIRED');
    // Give it a moment then mark as ready if ready event hasn't fired
    setTimeout(() => {
      if (!isClientReady) {
        isClientReady = true;
        logger.info('Marking client as ready after authentication (ready event did not fire)');
      }
    }, 5000);
  });

  // Now initialize the client
  try {
    await whatsAppClient.initialize();
    logger.info('WhatsApp client initialization complete');
  } catch (error) {
    logger.error('Failed to initialize WhatsApp client, exiting', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    await publisher.disconnect();
    process.exit(1);
  }

  logger.info('========================================');
  logger.info('WhatsApp Collector Service is running');
  logger.info('Waiting for messages...');
  logger.info('========================================');

  // Graceful shutdown handlers
  const shutdown = async (signal: string, exitCode: number) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress; ignoring duplicate signal', { signal });
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Disconnect publisher (will flush queue)
      await publisher.disconnect();
      
      // Destroy WhatsApp client
      await whatsAppClient.client.destroy();
      
      logger.info('Shutdown complete');
      process.exit(exitCode);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    void shutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    void shutdown('unhandledRejection', 1);
  });
}

// Start the service
startCollector().catch((err) => {
  logger.error('Fatal error starting collector', { error: err });
  process.exit(1);
});
