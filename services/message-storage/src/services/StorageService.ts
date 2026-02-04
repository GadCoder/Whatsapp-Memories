import { getPool } from '../database/connection';
import { WhatsAppMessage } from '../types/message.types';
import { config } from '../config/config';
import pgvector from 'pgvector/pg';

export class StorageService {
  private initialized = false;

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

    const values = [
      message.messageId,
      message.chatId,
      message.from,
      message.author || null,
      message.text,
      message.senderName || null,
      message.senderPushname || null,
      message.senderNumber || null,
      message.messageType,
      timestamp,
      message.isGroup,
      message.groupName || null,
      message.participantCount || null,
      message.fromMe,
      message.isForwarded,
      message.isBroadcast,
      message.hasQuotedMsg,
      message.quotedMsgId || null,
      message.quotedMsgBody || null,
      message.mentionedIds || null,
      message.hasMedia,
      message.mediaType || null,
      message.mediaUrl || null,
      message.caption || null,
      message.mimeType || null,
      message.fileSize || null,
      embeddingValue,
      embeddingProvider,
    ];

    try {
      const result = await pool.query(query, values);
      
      if (config.debug) {
        if (result.rowCount === 1) {
          console.log(`[Storage] Saved message: ${message.messageId}`);
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
}
