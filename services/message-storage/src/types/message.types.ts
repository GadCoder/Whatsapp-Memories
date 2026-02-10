/**
 * Message types - copied from whatsapp-collector for decoupling
 * TODO: Consider extracting to shared package if types diverge
 */

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'other';

export interface WhatsAppMessage {
  // Core message fields
  messageId: string;
  chatId: string;
  from: string;
  timestamp: Date | string; // May come as ISO string from Redis
  text: string;
  isGroup: boolean;
  hasMedia: boolean;
  messageType: MessageType;

  // Contact information
  senderName?: string; // Contact name as saved in your phone
  senderPushname?: string; // Contact's public display name
  senderNumber?: string; // Formatted phone number (+51 912 345 678)

  // Additional metadata
  author?: string;
  isForwarded: boolean;
  hasQuotedMsg: boolean;
  quotedMsgId?: string;
  quotedMsgBody?: string;
  mentionedIds?: string[];

  // Group-specific
  groupName?: string;
  participantCount?: number;

  // Broadcast-specific
  isBroadcast: boolean;

  // Message status
  fromMe: boolean;
  recipient?: string; // The recipient (when fromMe=true, this is who you sent to)
  ack?: number;

  // Media fields
  mediaType?: string;
  mediaUrl?: string;
  caption?: string;
  mimeType?: string;
  fileSize?: number;
}

export const REDIS_CHANNELS = [
  'memories:text:saved',
  'memories:image:saved',
  'memories:video:saved',
  'memories:audio:saved',
  'memories:document:saved',
  'memories:other:saved',
] as const;

export type RedisChannel = typeof REDIS_CHANNELS[number];

/**
 * Database message representation
 * Some fields are encrypted at rest (text, phone numbers, etc.)
 * Metadata remains plaintext for querying (sender_name, timestamp, etc.)
 */
export interface EncryptedMessage {
  id: string;
  message_id: string;
  chat_id: string;                    // PLAIN - queryable
  sender: string;                     // PLAIN - queryable (chat ID)
  author: string | null;              // ENCRYPTED - raw WhatsApp ID
  text: string;                       // ENCRYPTED - message content
  sender_name: string | null;         // PLAIN - queryable (contact name)
  sender_pushname: string | null;     // PLAIN - queryable (display name)
  sender_number: string | null;       // ENCRYPTED - phone number (PII)
  message_type: string;               // PLAIN
  timestamp: Date;                    // PLAIN - queryable
  is_group: boolean;                  // PLAIN
  group_name: string | null;          // PLAIN - queryable
  participant_count: number | null;   // PLAIN
  from_me: boolean;                   // PLAIN
  is_forwarded: boolean;              // PLAIN
  is_broadcast: boolean;              // PLAIN
  has_quoted_msg: boolean;            // PLAIN
  quoted_msg_id: string | null;       // PLAIN
  quoted_msg_body: string | null;     // ENCRYPTED - quoted content
  mentioned_ids: string | null;       // ENCRYPTED - JSON array of IDs (stored as encrypted string)
  has_media: boolean;                 // PLAIN
  media_type: string | null;          // PLAIN
  media_url: string | null;           // ENCRYPTED - URL
  caption: string | null;             // ENCRYPTED - media caption
  mime_type: string | null;           // PLAIN
  file_size: number | null;           // PLAIN
  embedding: number[] | null;         // PLAIN - searchable
  embedding_provider: string | null;   // PLAIN
  created_at: Date;                   // PLAIN
}

/**
 * Decrypted message for application use
 * Overrides encrypted fields with their decrypted types
 */
export interface DecryptedMessage extends Omit<EncryptedMessage, 'mentioned_ids'> {
  // Override mentioned_ids to be the decrypted array type
  mentioned_ids: string[] | null;
}
