import crypto from 'crypto';

/**
 * AES-256-GCM encryption service for sensitive message data
 * 
 * Encryption Strategy (Option 1 - Hybrid):
 * - ENCRYPT: text, phone numbers, raw IDs, captions, media URLs (sensitive content)
 * - PLAIN: sender_name, timestamp, group_name, embeddings (queryable metadata)
 * 
 * Format: iv:authTag:ciphertext (all hex, colon-separated)
 */
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be set and be 64 hex characters (256 bits). ' +
        'Generate with: openssl rand -hex 32'
      );
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  /**
   * Encrypt plaintext string to hex format
   * Returns: iv:authTag:ciphertext
   * 
   * IV: 16 bytes (128 bits) for AES-256-GCM - REQUIRED for GCM security
   * Auth Tag: 16 bytes (128 bits) - provides authentication
   * Minimum output length: 67 chars (32:32:1 for single char plaintext)
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) return null;
    
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
   * Returns null on failure (doesn't expose error details)
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;

    // Check if plaintext (backward compatibility with existing data)
    if (!ciphertext.includes(':')) {
      return ciphertext;
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      console.warn('Invalid ciphertext format');
      return null;
    }

    const [ivHex, authTagHex, encrypted] = parts;

    // Validate hex format
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(ivHex) || !hexRegex.test(authTagHex) || !hexRegex.test(encrypted)) {
      console.warn('Invalid hex in ciphertext');
      return null;
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
      console.error('Decryption failed');
      return null;
    }
  }

  /**
   * Encrypt an array of strings (e.g., mentioned_ids)
   * Returns JSON-serialized encrypted array
   */
  encryptArray(arr: string[] | null | undefined): string | null {
    if (!arr || arr.length === 0) return null;
    const serialized = JSON.stringify(arr);
    return this.encrypt(serialized);
  }

  /**
   * Decrypt an array of strings
   */
  decryptArray(encrypted: string | null | undefined): string[] | null {
    if (!encrypted) return null;
    const decrypted = this.decrypt(encrypted);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  /**
   * Check if text appears to be encrypted
   * Validates format: iv:authTag:ciphertext (all hex)
   * Minimum length: 67 chars (32:32:1)
   */
  isEncrypted(text: string | null): boolean {
    if (!text) return false;

    const parts = text.split(':');
    if (parts.length !== 3) return false;

    const [ivHex, authTagHex, cipherHex] = parts;
    const hexRegex = /^[0-9a-fA-F]+$/;

    // IV and auth tag must be exactly 32 hex chars (16 bytes)
    if (ivHex.length !== 32 || authTagHex.length !== 32) return false;
    if (!hexRegex.test(ivHex) || !hexRegex.test(authTagHex)) return false;

    // Ciphertext must be valid hex, minimum 2 chars (1 byte)
    if (cipherHex.length < 2 || cipherHex.length % 2 !== 0) return false;
    if (!hexRegex.test(cipherHex)) return false;

    return true;
  }
}
