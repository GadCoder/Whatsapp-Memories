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
