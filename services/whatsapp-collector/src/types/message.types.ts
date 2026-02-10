export interface WhatsAppMessage {
  // Core message fields
  messageId: string;
  chatId: string;
  from: string;
  timestamp: Date;
  text: string;
  isGroup: boolean;
  hasMedia: boolean;
  messageType: MessageType;

  // Contact information (fetched from WhatsApp)
  senderName?: string; // Contact name as saved in your phone
  senderPushname?: string; // Contact's public display name
  senderNumber?: string; // Formatted phone number (+51 912 345 678)

  // Additional metadata
  author?: string; // Sender in group (different from 'from' which is chatId)
  isForwarded: boolean; // Is this a forwarded message?
  hasQuotedMsg: boolean; // Is this a reply to another message?
  quotedMsgId?: string; // ID of the message being replied to
  quotedMsgBody?: string; // Text of the message being replied to
  mentionedIds?: string[]; // Users mentioned in the message (@mentions)

  // Group-specific
  groupName?: string; // Name of the group (if isGroup=true)
  participantCount?: number; // Number of participants (if isGroup=true)

  // Broadcast-specific
  isBroadcast: boolean; // Is from broadcast list?

  // Message status
  fromMe: boolean; // Did we send this message?
  recipient?: string; // The recipient (when fromMe=true, this is who you sent to)
  ack?: number; // Acknowledgment status (0=error, 1=pending, 2=server, 3=delivered, 4=read)

  // Future media fields (for when we implement media)
  mediaType?: string;
  mediaUrl?: string;
  caption?: string;
  mimeType?: string;
  fileSize?: number;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'other';

export interface FilterConfig {
  mode: 'all' | 'allowlist' | 'blocklist';
  contacts: string[];
  groupsFilter: 'include' | 'exclude' | 'only';
  includeBroadcast: boolean;
}

export interface RedisChannels {
  TEXT: 'memories:text:saved';
  IMAGE: 'memories:image:saved';
  VIDEO: 'memories:video:saved';
  AUDIO: 'memories:audio:saved';
  DOCUMENT: 'memories:document:saved';
  OTHER: 'memories:other:saved';
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface QueueConfig {
  maxSize: number;
  flushInterval: number;
}
