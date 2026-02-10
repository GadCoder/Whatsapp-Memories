import crypto from 'crypto';
import { config } from '../config/config';

/**
 * Custom error for decryption failures
 * Allows callers to distinguish decryption errors from other failures
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
 * Encryption Strategy (Option 1 - Hybrid):
 * - ENCRYPT: text, phone numbers, raw IDs, captions, media URLs (sensitive content)
 * - PLAIN: sender_name, timestamp, group_name, embeddings (queryable metadata)
 * 
 * Format: iv:authTag:ciphertext (all hex, colon-separated)
 * 
 * When encryption is disabled (no ENCRYPTION_KEY), operates in pass-through mode.
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm' as const;
  private key: Buffer | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = config.encryption.enabled;
    
    if (this.enabled) {
      const keyHex = config.encryption.key;
      if (!keyHex || keyHex.length !== 64) {
        throw new Error(
          'ENCRYPTION_KEY must be set and be 64 hex characters (256 bits). ' +
          'Generate with: openssl rand -hex 32'
        );
      }
      this.key = Buffer.from(keyHex, 'hex');
      console.log('[Encryption] AES-256-GCM encryption enabled');
    } else {
      console.log('[Encryption] Encryption disabled - data will be stored in plaintext');
    }
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Encrypt plaintext string to hex format
   * Returns: iv:authTag:ciphertext
   * 
   * IV: 16 bytes (128 bits) for AES-256-GCM - REQUIRED for GCM security
   * Auth Tag: 16 bytes (128 bits) - provides authentication
   * Minimum output length: 67 chars (32:32:1 for single char plaintext)
   * 
   * If encryption is disabled, returns plaintext unchanged.
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;
    
    // Pass-through mode when encryption is disabled
    if (!this.enabled || !this.key) {
      return plaintext;
    }
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt from hex format
   * Backward compatible: returns plaintext if not encrypted (no colons)
   * Throws DecryptionError on failure to prevent silent data loss.
   * 
   * If encryption is disabled, returns ciphertext unchanged.
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    // Check if plaintext (backward compatibility with existing data)
    if (!ciphertext.includes(':')) {
      return ciphertext;
    }

    // If encryption is disabled but we encounter encrypted data, 
    // we can't decrypt it - throw an error
    if (!this.enabled || !this.key) {
      throw new DecryptionError(
        'Cannot decrypt data: encryption is disabled but encrypted data was found. ' +
        'Set ENCRYPTION_KEY to decrypt existing encrypted data.'
      );
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new DecryptionError('Invalid ciphertext format: expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    // Validate hex format
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(ivHex) || !hexRegex.test(authTagHex) || !hexRegex.test(encrypted)) {
      throw new DecryptionError('Invalid hex encoding in ciphertext');
    }

    // Validate IV and authTag lengths (must be exactly 32 hex chars = 16 bytes)
    if (ivHex.length !== 32) {
      throw new DecryptionError(`Invalid IV length: expected 32 hex chars, got ${ivHex.length}`);
    }
    if (authTagHex.length !== 32) {
      throw new DecryptionError(`Invalid authTag length: expected 32 hex chars, got ${authTagHex.length}`);
    }

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
      throw new DecryptionError('Decryption failed: authentication failed or corrupted data');
    }
  }

  /**
   * Encrypt an array of strings (e.g., mentioned_ids)
   * Returns JSON-serialized encrypted string, or JSON string if encryption disabled
   */
  encryptArray(arr: string[] | null | undefined): string | null {
    if (!arr || arr.length === 0) return null;
    const serialized = JSON.stringify(arr);
    return this.encrypt(serialized);
  }

  /**
   * Decrypt an array of strings
   * Throws DecryptionError on failure
   */
  decryptArray(encrypted: string | null | undefined): string[] | null {
    if (!encrypted) return null;
    const decrypted = this.decrypt(encrypted);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch {
      throw new DecryptionError('Failed to parse decrypted array as JSON');
    }
  }
}
