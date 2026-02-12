import crypto from 'crypto';
import { config } from '../config/config';
import { logger } from '../utils/logger';

/**
 * Custom error for decryption failures
 */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * AES-256-GCM encryption service for sensitive message data
 * 
 * Format: iv:authTag:ciphertext (all hex, colon-separated)
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm' as const;
  private key: Buffer;

  constructor() {
    const keyHex = config.encryption.key;
    this.key = Buffer.from(keyHex, 'hex');
    logger.info('AES-256-GCM encryption service initialized');
  }

  /**
   * Decrypt from hex format
   * Backward compatible: returns plaintext if not encrypted (no colons)
   * Returns null on failure (graceful degradation)
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    // Check if plaintext (backward compatibility)
    if (!ciphertext.includes(':')) {
      return ciphertext;
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      logger.warn('Invalid ciphertext format: expected iv:authTag:ciphertext');
      return null;
    }

    const [ivHex, authTagHex, encrypted] = parts;

    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.warn({ error }, 'Decryption failed for message');
      return null; // Graceful degradation
    }
  }
}
