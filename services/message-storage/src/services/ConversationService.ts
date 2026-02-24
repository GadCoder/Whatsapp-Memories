import crypto from 'crypto';
import { PoolClient } from 'pg';
import { config } from '../config/config';
import { getPool } from '../database/connection';
import { WhatsAppMessage } from '../types/message.types';
import { EncryptionService } from './EncryptionService';

interface OpenConversation {
  id: string;
  ended_at: Date;
  participants_encrypted: string | null;
}

export class ConversationService {
  private encryption: EncryptionService;
  private lastEmbeddingByConversation = new Map<string, number[]>();

  constructor() {
    this.encryption = new EncryptionService();
  }

  async onMessage(message: WhatsAppMessage, embedding: number[] | null): Promise<void> {
    const timestamp = this.toDate(message.timestamp);

    await this.withChatLock(message.chatId, async (client) => {
      const open = await this.getOpenConversation(client, message.chatId);

      if (!open) {
        const newConversationId = await this.createConversation(client, message, timestamp);
        this.updateEmbeddingCache(newConversationId, embedding);
        this.log('created', { chatId: message.chatId, conversationId: newConversationId, messageId: message.messageId });
        return;
      }

      const gapMinutes = (timestamp.getTime() - new Date(open.ended_at).getTime()) / 60000;
      const semanticBreak = await this.detectSemanticBreak(client, open.id, embedding);

      if (gapMinutes > config.conversation.maxGapMinutes || semanticBreak) {
        await this.finalizeConversation(client, open.id);
        this.lastEmbeddingByConversation.delete(open.id);

        const newConversationId = await this.createConversation(client, message, timestamp);
        this.updateEmbeddingCache(newConversationId, embedding);

        this.log('closed_and_created', {
          chatId: message.chatId,
          closedConversationId: open.id,
          newConversationId,
          messageId: message.messageId,
          gapMinutes,
          semanticBreak,
        });

        return;
      }

      const appended = await this.appendToConversation(client, open, message, timestamp);
      if (appended) {
        this.updateEmbeddingCache(open.id, embedding);
        this.log('appended', { chatId: message.chatId, conversationId: open.id, messageId: message.messageId });
      }
    });
  }

  private async withChatLock(chatId: string, fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [chatId]);
      await fn(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.log('error', { chatId, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    } finally {
      client.release();
    }
  }

  private async getOpenConversation(client: PoolClient, chatId: string): Promise<OpenConversation | null> {
    const result = await client.query(
      `SELECT id, ended_at, participants_encrypted
       FROM conversations
       WHERE chat_id = $1 AND status = 'open'
       ORDER BY ended_at DESC
       LIMIT 1`,
      [chatId]
    );

    return result.rows[0] ?? null;
  }

  private async createConversation(client: PoolClient, message: WhatsAppMessage, timestamp: Date): Promise<string> {
    const conversationKey = this.buildConversationKey(message.chatId, message.messageId, timestamp);
    const participants = this.collectParticipants(message);

    const insertConversation = await client.query(
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

    const conversationId = insertConversation.rows[0].id as string;

    await client.query(
      `INSERT INTO conversation_messages (conversation_id, message_id, timestamp)
       VALUES ($1, $2, $3)`,
      [conversationId, message.messageId, timestamp]
    );

    return conversationId;
  }

  private async appendToConversation(
    client: PoolClient,
    open: OpenConversation,
    message: WhatsAppMessage,
    timestamp: Date
  ): Promise<boolean> {
    const insertResult = await client.query(
      `INSERT INTO conversation_messages (conversation_id, message_id, timestamp)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING 1`,
      [open.id, message.messageId, timestamp]
    );

    if ((insertResult.rowCount ?? 0) === 0) {
      return false;
    }

    const mergedParticipants = this.mergeParticipants(open.participants_encrypted, this.collectParticipants(message));

    await client.query(
      `UPDATE conversations
       SET ended_at = GREATEST(ended_at, $2),
           end_message_id = CASE WHEN $2 >= ended_at THEN $3 ELSE end_message_id END,
           message_count = message_count + 1,
           participants_encrypted = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [open.id, timestamp, message.messageId, this.encryption.encryptArray(mergedParticipants)]
    );

    return true;
  }

  private async finalizeConversation(client: PoolClient, conversationId: string): Promise<void> {
    const messagesResult = await client.query(
      `SELECT m.text, m.timestamp
       FROM conversation_messages cm
       JOIN messages m ON m.message_id = cm.message_id
       WHERE cm.conversation_id = $1
       ORDER BY m.timestamp ASC
       LIMIT 20`,
      [conversationId]
    );

    const decryptedTexts = messagesResult.rows
      .map((row) => this.encryption.decrypt(row.text))
      .filter((text): text is string => Boolean(text && text.trim().length > 0));

    const title = this.pickTitle(decryptedTexts);
    const summary = decryptedTexts.slice(0, 3).join(' | ').slice(0, 512);
    const classification = this.classifyConversation(decryptedTexts.join(' '));

    await client.query(
      `UPDATE conversations
       SET status = 'closed',
           title_encrypted = $2,
           summary_encrypted = $3,
           topic_label = $4,
           classification_confidence = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [
        conversationId,
        this.encryption.encrypt(title),
        this.encryption.encrypt(summary),
        classification.label,
        classification.confidence,
      ]
    );
  }

  // Intentionally bilingual (Spanish/English) because chats in this workspace are mixed-language.
  private classifyConversation(text: string): { label: string; confidence: number } {
    const rules: Array<{ label: string; regex: RegExp }> = [
      { label: 'tech', regex: /(macbook|laptop|iphone|android|pc|teclado|monitor|software)/i },
      { label: 'shopping', regex: /(precio|compra|comprar|mercado libre|oferta|venta)/i },
      { label: 'planning', regex: /(reunion|meeting|agenda|mañana|hoy|hora)/i },
      { label: 'casual', regex: /(familia|cumple|amigo|jaja|jajaj)/i },
    ];

    if (!text.trim()) {
      return { label: 'unknown', confidence: 0 };
    }

    let matches = 0;
    let label = 'general';

    for (const rule of rules) {
      if (rule.regex.test(text)) {
        matches += 1;
        if (label === 'general') {
          label = rule.label;
        }
      }
    }

    const confidence = Math.min(0.95, 0.35 + matches * 0.2);
    return { label, confidence };
  }

  private pickTitle(messages: string[]): string {
    const substantive = messages.find((message) => message.trim().length >= 10);
    return (substantive ?? messages[0] ?? 'Conversation').slice(0, 80);
  }

  private async detectSemanticBreak(
    client: PoolClient,
    conversationId: string,
    embedding: number[] | null
  ): Promise<boolean> {
    if (!embedding || embedding.length === 0) {
      return false;
    }

    const previous = await this.getPreviousEmbedding(client, conversationId);
    if (!previous || previous.length !== embedding.length) {
      return false;
    }

    const similarity = this.cosineSimilarity(previous, embedding);
    const drift = 1 - similarity;

    return (
      similarity < config.conversation.minEmbeddingSimilarity ||
      drift > config.conversation.semanticDriftThreshold
    );
  }

  private async getPreviousEmbedding(client: PoolClient, conversationId: string): Promise<number[] | null> {
    const cached = this.lastEmbeddingByConversation.get(conversationId);
    if (cached) {
      return cached;
    }

    const result = await client.query(
      `SELECT m.embedding
       FROM conversation_messages cm
       JOIN messages m ON m.message_id = cm.message_id
       WHERE cm.conversation_id = $1 AND m.embedding IS NOT NULL
       ORDER BY cm.timestamp DESC
       LIMIT 1`,
      [conversationId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    const previous = result.rows[0].embedding as number[] | null;
    if (previous && previous.length > 0) {
      this.lastEmbeddingByConversation.set(conversationId, previous);
    }

    return previous;
  }

  private updateEmbeddingCache(conversationId: string, embedding: number[] | null): void {
    if (embedding && embedding.length > 0) {
      this.lastEmbeddingByConversation.set(conversationId, embedding);
    }
  }

  private mergeParticipants(existingEncrypted: string | null, incoming: string[]): string[] {
    const participants = new Set<string>();

    if (existingEncrypted) {
      try {
        const decrypted = this.encryption.decryptArray(existingEncrypted) ?? [];
        for (const value of decrypted) participants.add(value);
      } catch {
        // keep running; we'll rebuild from incoming values
      }
    }

    for (const value of incoming) participants.add(value);

    return Array.from(participants).slice(0, 100);
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

  private log(event: string, meta: Record<string, unknown>): void {
    if (!config.debug) return;
    console.log(`[Conversation] ${event}`, meta);
  }
}
