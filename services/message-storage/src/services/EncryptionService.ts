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
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null;
    
    // Check if plaintext (backward compatibility with existing data)
    if (!ciphertext.includes(':')) {
      return ciphertext;
    }
    
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      console.warn('Invalid ciphertext format, returning as-is');
      return ciphertext;
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
      console.error('Decryption failed:', error);
      return '[DECRYPTION_FAILED]';
    }
  }

  /**
   * Check if text appears to be encrypted
   * Heuristic: contains 3 parts separated by colons and is reasonably long
   */
  isEncrypted(text: string | null): boolean {
    if (!text) return false;
    return text.split(':').length === 3 && text.length > 100;
  }
}
