import * as qrcode from 'qrcode-terminal';
import { Client, ClientOptions, LocalAuth } from 'whatsapp-web.js';
import { logger } from '../utils/logger';

/**
 * WhatsApp client singleton
 * Handles initialization, authentication, and connection to WhatsApp Web
 */
class WhatsAppClient {
  private static instance: WhatsAppClient;
  public readonly client: Client;

  private constructor() {
    const clientOptions: ClientOptions = {
      authStrategy: new LocalAuth(),
      webVersionCache: { type: 'local' },
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    };

    this.client = new Client(clientOptions);
  }

  public async initialize(): Promise<void> {
    logger.info('Initializing WhatsApp client...');

    this.client.on('qr', (qr: string) => {
      logger.info('QR Code received, scan with your WhatsApp mobile app:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => {
      logger.info('Client authenticated successfully');
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('Authentication failed', { message: msg });
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('Client disconnected', { reason });
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
    });

    try {
      await this.client.initialize();
      logger.info('WhatsApp client initialization complete');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  public static getInstance(): WhatsAppClient {
    if (!WhatsAppClient.instance) {
      WhatsAppClient.instance = new WhatsAppClient();
    }
    return WhatsAppClient.instance;
  }
}

export default WhatsAppClient.getInstance();
