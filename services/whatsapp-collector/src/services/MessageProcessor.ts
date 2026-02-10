import { Message, Contact, Chat, GroupChat } from 'whatsapp-web.js';
import { WhatsAppMessage, MessageType } from '../types/message.types';
import { logger } from '../utils/logger';

/**
 * Service for processing raw WhatsApp messages into structured data
 */
export class MessageProcessor {
  /**
   * Process a raw WhatsApp message into our structured format
   * Extracts all relevant metadata including replies, forwards, mentions, etc.
   */
  async processMessage(message: Message): Promise<WhatsAppMessage> {
    const messageType = this.determineMessageType(message);
    const isGroup = message.from.endsWith('@g.us');
    const isBroadcast = message.from.endsWith('@broadcast');

    // Get group info if applicable
    let groupName: string | undefined;
    let participantCount: number | undefined;

    if (isGroup) {
      try {
        const chat = await message.getChat();
        groupName = chat.name;
        if (chat.isGroup) {
          const groupChat = chat as GroupChat;
          participantCount = groupChat.participants?.length;
        }
      } catch (error) {
        logger.warn('Failed to get group info', {
          error: (error as Error).message,
          chatId: message.from,
        });
      }
    }

    // Get quoted message info if this is a reply
    let quotedMsgId: string | undefined;
    let quotedMsgBody: string | undefined;

    if (message.hasQuotedMsg) {
      try {
        const quotedMsg = await message.getQuotedMessage();
        quotedMsgId = quotedMsg.id._serialized;
        quotedMsgBody = quotedMsg.body;
      } catch (error) {
        logger.warn('Failed to get quoted message', {
          error: (error as Error).message,
          messageId: message.id._serialized,
        });
      }
    }

    // Extract mentions
    const mentionedIds = message.mentionedIds || [];

    // Get contact info (name, pushname, formatted number)
    let senderName: string | undefined;
    let senderPushname: string | undefined;
    let senderNumber: string | undefined;

    try {
      const contact = await message.getContact();
      senderName = contact.name || undefined;
      senderPushname = contact.pushname || undefined;
      
      // Get formatted phone number (e.g., "+51 912 345 678")
      try {
        senderNumber = await contact.getFormattedNumber();
      } catch (formatError) {
        // Fallback: derive from sender/contact ID
        // For group messages, message.from is the group ID, so use author or contact ID
        let rawId: string | undefined;
        if (isGroup) {
          // In groups, use author (actual sender) or contact ID
          rawId = message.author ?? contact.id?._serialized;
        } else {
          // In direct chats, message.from is the peer's JID
          rawId = message.from ?? contact.id?._serialized;
        }
        if (rawId) {
          senderNumber = rawId.replace('@c.us', '').replace('@g.us', '');
        }
      }
    } catch (error) {
      logger.warn('Failed to get contact info', {
        error: (error as Error).message,
        messageId: message.id._serialized,
      });
    }

    const processed: WhatsAppMessage = {
      messageId: message.id._serialized,
      chatId: message.from,
      from: message.from,
      author: message.author || message.from,
      timestamp: new Date(message.timestamp * 1000),
      text: message.body,
      isGroup,
      isBroadcast,
      hasMedia: message.hasMedia,
      messageType,
      fromMe: message.fromMe,
      recipient: message.fromMe ? message.to : undefined, // Capture recipient for outbound messages
      isForwarded: message.isForwarded,
      hasQuotedMsg: message.hasQuotedMsg,
      quotedMsgId,
      quotedMsgBody,
      mentionedIds,
      groupName,
      participantCount,
      ack: message.ack,
      // Contact information
      senderName,
      senderPushname,
      senderNumber,
    };

    logger.debug('Processed message', {
      messageId: processed.messageId,
      type: messageType,
      isGroup,
      hasMedia: message.hasMedia,
      hasQuotedMsg: message.hasQuotedMsg,
      isForwarded: message.isForwarded,
      mentionsCount: mentionedIds.length,
      hasContactInfo: !!(senderName || senderPushname),
    });

    return processed;
  }

  /**
   * Determine the message type from the raw message
   * Currently only classifies text messages, others are marked as 'other'
   * TODO: Implement media type detection when media support is added
   */
  private determineMessageType(message: Message): MessageType {
    // For now, only text messages (no media)
    if (!message.hasMedia && message.body) {
      return 'text';
    }

    // Future: When we implement media support, check message.type
    // message.type can be: 'chat', 'image', 'video', 'audio', 'ptt', 'document', etc.
    if (message.hasMedia) {
      // Placeholder for future media handling
      // switch (message.type) {
      //   case 'image': return 'image';
      //   case 'video': return 'video';
      //   case 'audio':
      //   case 'ptt': return 'audio';
      //   case 'document': return 'document';
      //   default: return 'other';
      // }
      return 'other';
    }

    return 'other';
  }
}
