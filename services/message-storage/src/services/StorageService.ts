import { getPool } from '../database/connection';
import { WhatsAppMessage, DecryptedMessage } from '../types/message.types';
import { config } from '../config/config';
import { EncryptionService } from './EncryptionService';
import pgvector from 'pgvector/pg';

export class StorageService {
  private initialized = false;
  private encryptionService: EncryptionService;

  constructor() {
    this.encryptionService = new EncryptionService();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register pgvector type with pg
    const pool = getPool();
    const client = await pool.connect();
    try {
      await pgvector.registerType(client);
      this.initialized = true;
      console.log('[Storage] pgvector type registered');
    } finally {
      client.release();
    }
  }

  /**
   * Save a message with its embedding to the database
   * Uses upsert to handle duplicate messages gracefully
   * Encrypts sensitive fields (content, PII) while keeping metadata queryable
   */
  async saveMessage(
    message: WhatsAppMessage, 
    embedding: number[] | null,
    embeddingProvider: string | null = null
  ): Promise<void> {
    const pool = getPool();

    const query = `
      INSERT INTO messages (
        message_id,
        chat_id,
        sender,
        author,
        text,
        sender_name,
        sender_pushname,
        sender_number,
        message_type,
        timestamp,
        is_group,
        group_name,
        participant_count,
        from_me,
        is_forwarded,
        is_broadcast,
        has_quoted_msg,
        quoted_msg_id,
        quoted_msg_body,
        mentioned_ids,
        has_media,
        media_type,
        media_url,
        caption,
        mime_type,
        file_size,
        embedding,
        embedding_provider
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (message_id) DO NOTHING
    `;

    // Convert timestamp to Date if it's a string
    const timestamp = typeof message.timestamp === 'string' 
      ? new Date(message.timestamp) 
      : message.timestamp;

    // Format embedding for pgvector
    const embeddingValue = embedding ? pgvector.toSql(embedding) : null;

    // Encrypt sensitive fields, keep metadata queryable
    const values = [
      message.messageId,                                               // $1
      message.chatId,                                                  // $2 - PLAIN (queryable)
      message.from,                                                    // $3 - PLAIN (queryable)
      this.encryptionService.encrypt(message.author),                  // $4 - ENCRYPTED (raw ID)
      this.encryptionService.encrypt(message.text),                    // $5 - ENCRYPTED (content)
      message.senderName || null,                                      // $6 - PLAIN (queryable)
      message.senderPushname || null,                                  // $7 - PLAIN (queryable)
      this.encryptionService.encrypt(message.senderNumber),            // $8 - ENCRYPTED (PII)
      message.messageType,                                             // $9 - PLAIN
      timestamp,                                                       // $10 - PLAIN (queryable)
      message.isGroup,                                                 // $11 - PLAIN
      message.groupName || null,                                       // $12 - PLAIN (queryable)
      message.participantCount || null,                                // $13 - PLAIN
      message.fromMe,                                                  // $14 - PLAIN
      message.isForwarded,                                             // $15 - PLAIN
      message.isBroadcast,                                             // $16 - PLAIN
      message.hasQuotedMsg,                                            // $17 - PLAIN
      message.quotedMsgId || null,                                     // $18 - PLAIN
      this.encryptionService.encrypt(message.quotedMsgBody),           // $19 - ENCRYPTED (content)
      this.encryptionService.encryptArray(message.mentionedIds),        // $20 - ENCRYPTED (PII)
      message.hasMedia,                                                // $21 - PLAIN
      message.mediaType || null,                                       // $22 - PLAIN
      this.encryptionService.encrypt(message.mediaUrl),                // $23 - ENCRYPTED (URL)
      this.encryptionService.encrypt(message.caption),                 // $24 - ENCRYPTED (content)
      message.mimeType || null,                                        // $25 - PLAIN
      message.fileSize || null,                                        // $26 - PLAIN
      embeddingValue,                                                  // $27 - PLAIN (searchable)
      embeddingProvider,                                               // $28 - PLAIN
    ];

    try {
      const result = await pool.query(query, values);
      
      if (config.debug) {
        if (result.rowCount === 1) {
          console.log(`[Storage] Saved encrypted message: ${message.messageId}`);
        } else {
          console.log(`[Storage] Message already exists: ${message.messageId}`);
        }
      }
    } catch (error) {
      console.error('[Storage] Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Get message count for monitoring
   */
  async getMessageCount(): Promise<number> {
    const pool = getPool();
    const result = await pool.query('SELECT COUNT(*) as count FROM messages');
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get messages with embeddings count (for monitoring embedding coverage)
   */
  async getEmbeddedMessageCount(): Promise<number> {
    const pool = getPool();
    const result = await pool.query('SELECT COUNT(*) as count FROM messages WHERE embedding IS NOT NULL');
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get embedding statistics by provider
   */
  async getEmbeddingStatsByProvider(): Promise<Map<string, number>> {
    const pool = getPool();
    const result = await pool.query(`
      SELECT embedding_provider, COUNT(*) as count 
      FROM messages 
      WHERE embedding_provider IS NOT NULL 
      GROUP BY embedding_provider
    `);
    
    const stats = new Map<string, number>();
    for (const row of result.rows) {
      stats.set(row.embedding_provider, parseInt(row.count, 10));
    }
    return stats;
  }

  /**
   * Get a message by ID and decrypt sensitive fields
   */
  async getMessageById(messageId: string): Promise<DecryptedMessage | null> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM messages WHERE message_id = $1',
      [messageId]
    );
    
    if (result.rows.length === 0) return null;
    
    return this.decryptMessageRow(result.rows[0]);
  }

  /**
   * Search messages by sender name, date range, and semantic similarity
   * Perfect for queries like: "Luis talked about fútbol last month"
   */
  async searchBySenderAndContent(
    senderName: string,
    queryEmbedding: number[],
    since: Date,
    limit: number = 10
  ): Promise<DecryptedMessage[]> {
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT *, embedding <-> $1 as distance
      FROM messages
      WHERE sender_name = $2
        AND timestamp >= $3
        AND embedding IS NOT NULL
      ORDER BY embedding <-> $1
      LIMIT $4
    `, [
      pgvector.toSql(queryEmbedding),
      senderName,      // Plaintext filter (fast, indexed)
      since,           // Plaintext filter (fast, indexed)
      limit
    ]);
    
    // Decrypt sensitive fields for display
    return result.rows.map(row => this.decryptMessageRow(row));
  }

  /**
   * Search by embedding only (semantic search)
   * Returns decrypted results
   */
  async searchByEmbedding(
    queryEmbedding: number[],
    limit: number = 10
  ): Promise<DecryptedMessage[]> {
    const pool = getPool();
    
    const result = await pool.query(`
      SELECT *, embedding <-> $1 as distance
      FROM messages
      WHERE embedding IS NOT NULL
      ORDER BY embedding <-> $1
      LIMIT $2
    `, [pgvector.toSql(queryEmbedding), limit]);
    
    return result.rows.map(row => this.decryptMessageRow(row));
  }

  /**
   * Decrypt sensitive fields in a database row
   * Plaintext fields (sender_name, timestamp, etc.) remain unchanged
   */
  private decryptMessageRow(row: any): DecryptedMessage {
    return {
      ...row,
      // Decrypt sensitive fields
      author: this.encryptionService.decrypt(row.author),
      text: this.encryptionService.decrypt(row.text),
      sender_number: this.encryptionService.decrypt(row.sender_number),
      quoted_msg_body: this.encryptionService.decrypt(row.quoted_msg_body),
      mentioned_ids: this.encryptionService.decryptArray(row.mentioned_ids),
      media_url: this.encryptionService.decrypt(row.media_url),
      caption: this.encryptionService.decrypt(row.caption),
      // sender_name, timestamp, group_name, etc. remain as-is (plaintext)
    };
  }
}
