import crypto from 'crypto';
import { config } from '../config/config';
import { getPool } from '../database/connection';
import { WhatsAppMessage } from '../types/message.types';
import { EncryptionService } from './EncryptionService';

interface OpenConversation {
  id: string;
  started_at: Date;
  ended_at: Date;
  end_message_id: string;
  message_count: number;
  participants_encrypted: string | null;
}

export class ConversationService {
  private encryption: EncryptionService;

  constructor() {
    this.encryption = new EncryptionService();
  }

  async onMessage(message: WhatsAppMessage, embedding: number[] | null): Promise<void> {
    const timestamp = this.toDate(message.timestamp);
    const pool = getPool();
    const open = await this.getOpenConversation(message.chatId);

    if (!open) {
      await this.createConversation(message, timestamp);
      return;
    }

    const gapMinutes = (timestamp.getTime() - new Date(open.ended_at).getTime()) / 60000;
    const semanticBreak = await this.detectSemanticBreak(open.id, embedding);

    if (gapMinutes > config.conversation.maxGapMinutes || semanticBreak) {
      await pool.query(
        `UPDATE conversations SET status = 'closed', updated_at = NOW() WHERE id = $1`,
        [open.id]
      );
      await this.createConversation(message, timestamp);
      return;
    }

    await this.appendToConversation(open.id, message, timestamp);
  }

  private async getOpenConversation(chatId: string): Promise<OpenConversation | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, started_at, ended_at, end_message_id, message_count, participants_encrypted
       FROM conversations
       WHERE chat_id = $1 AND status = 'open'
       ORDER BY ended_at DESC
       LIMIT 1`,
      [chatId]
    );

    return result.rows[0] ?? null;
  }

  private async createConversation(message: WhatsAppMessage, timestamp: Date): Promise<void> {
    const pool = getPool();
    const conversationKey = this.buildConversationKey(message.chatId, message.messageId, timestamp);
    const participants = this.collectParticipants(message);

    const insert = await pool.query(
      `INSERT INTO conversations (
        conversation_key, chat_id, started_at, ended_at,
        start_message_id, end_message_id, message_count,
        participants_encrypted, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
      RETURNING id`,
      [
        conversationKey,
        message.chatId,
        timestamp,
        timestamp,
        message.messageId,
        message.messageId,
        1,
        this.encryption.encryptArray(participants),
      ]
    );

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, message_id, timestamp)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [insert.rows[0].id, message.messageId, timestamp]
    );
  }

  private async appendToConversation(conversationId: string, message: WhatsAppMessage, timestamp: Date): Promise<void> {
    const pool = getPool();

    await pool.query(
      `INSERT INTO conversation_messages (conversation_id, message_id, timestamp)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [conversationId, message.messageId, timestamp]
    );

    await pool.query(
      `UPDATE conversations
       SET ended_at = GREATEST(ended_at, $2),
           end_message_id = $3,
           message_count = message_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [conversationId, timestamp, message.messageId]
    );
  }

  private async detectSemanticBreak(conversationId: string, embedding: number[] | null): Promise<boolean> {
    if (!embedding || embedding.length === 0) {
      return false;
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT m.embedding
       FROM conversation_messages cm
       JOIN messages m ON m.message_id = cm.message_id
       WHERE cm.conversation_id = $1 AND m.embedding IS NOT NULL
       ORDER BY cm.timestamp DESC
       LIMIT 1`,
      [conversationId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return false;
    }

    const previous = result.rows[0].embedding as number[] | null;
    if (!previous || previous.length !== embedding.length) {
      return false;
    }

    const similarity = this.cosineSimilarity(previous, embedding);
    return similarity < config.conversation.minEmbeddingSimilarity;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private collectParticipants(message: WhatsAppMessage): string[] {
    const participants = new Set<string>();
    participants.add(message.from);
    if (message.author) participants.add(message.author);
    if (message.recipient) participants.add(message.recipient);
    return Array.from(participants).slice(0, 25);
  }

  private buildConversationKey(chatId: string, messageId: string, timestamp: Date): string {
    const seed = `${chatId}:${messageId}:${timestamp.toISOString()}`;
    return crypto.createHash('sha256').update(seed).digest('hex');
  }

  private toDate(timestamp: Date | string): Date {
    return typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  }
}
