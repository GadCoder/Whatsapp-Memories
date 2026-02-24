import { pool } from '../database/connection';
import { EncryptionService } from './EncryptionService';

interface ThreadMessage {
  message_id: string;
  timestamp: string;
  sender_name: string | null;
  from_me: boolean;
  text: string | null;
}

export class ThreadService {
  private encryptionService: EncryptionService;

  constructor() {
    this.encryptionService = new EncryptionService();
  }

  async getThreadAroundAnchor(anchorMessageId: string): Promise<{
    anchor_message_id: string;
    conversation_id: string | null;
    total_messages: number;
    messages: Array<{
      message_id: string;
      timestamp: string;
      sender_name: string | null;
      from_me: boolean;
      text: string | null;
    }>;
  }> {
    const conversationResult = await pool.query(
      `SELECT conversation_id
       FROM conversation_messages
       WHERE message_id = $1
       LIMIT 1`,
      [anchorMessageId]
    );

    if ((conversationResult.rowCount ?? 0) > 0) {
      const conversationId = conversationResult.rows[0].conversation_id as string;
      const rows = await this.fetchConversationMessages(conversationId);
      return {
        anchor_message_id: anchorMessageId,
        conversation_id: conversationId,
        total_messages: rows.length,
        messages: rows.map((row) => this.decryptThreadMessage(row)),
      };
    }

    const anchorContext = await pool.query(
      `SELECT chat_id, timestamp
       FROM messages
       WHERE message_id = $1
       LIMIT 1`,
      [anchorMessageId]
    );

    if ((anchorContext.rowCount ?? 0) === 0) {
      return {
        anchor_message_id: anchorMessageId,
        conversation_id: null,
        total_messages: 0,
        messages: [],
      };
    }

    const { chat_id: chatId, timestamp } = anchorContext.rows[0];
    const rows = await pool.query(
      `SELECT message_id, timestamp, sender_name, from_me, text
       FROM messages
       WHERE chat_id = $1
         AND timestamp BETWEEN ($2::timestamptz - INTERVAL '90 minutes')
                           AND ($2::timestamptz + INTERVAL '90 minutes')
       ORDER BY timestamp ASC`,
      [chatId, timestamp]
    );

    return {
      anchor_message_id: anchorMessageId,
      conversation_id: null,
      total_messages: rows.rows.length,
      messages: rows.rows.map((row: ThreadMessage) => this.decryptThreadMessage(row)),
    };
  }

  private async fetchConversationMessages(conversationId: string): Promise<ThreadMessage[]> {
    const result = await pool.query(
      `SELECT m.message_id, m.timestamp, m.sender_name, m.from_me, m.text
       FROM conversation_messages cm
       JOIN messages m ON m.message_id = cm.message_id
       WHERE cm.conversation_id = $1
       ORDER BY m.timestamp ASC`,
      [conversationId]
    );

    return result.rows as ThreadMessage[];
  }

  private decryptThreadMessage(row: ThreadMessage): {
    message_id: string;
    timestamp: string;
    sender_name: string | null;
    from_me: boolean;
    text: string | null;
  } {
    return {
      message_id: row.message_id,
      timestamp: row.timestamp,
      sender_name: row.sender_name,
      from_me: row.from_me,
      text: this.encryptionService.decrypt(row.text),
    };
  }
}
