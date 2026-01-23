# WhatsApp Collector Service

The WhatsApp Collector is a service that listens to incoming WhatsApp messages and publishes them to Redis channels for downstream processing. It's part of the Whatsapp-Memories multi-service architecture.

## Features

- **Message Collection**: Listens to all incoming WhatsApp messages
- **Flexible Filtering**: Filter messages by contact, group status, or broadcast type
- **Type-Based Channels**: Publishes to different Redis channels based on message type
- **Extended Metadata**: Captures replies, forwards, mentions, group info, and more
- **Robust Error Handling**: 3-tier approach (log → retry → queue)
- **Graceful Shutdown**: Flushes queued messages before exiting
- **Debug Mode**: Detailed logging for development and troubleshooting

## Architecture

```
WhatsApp Web ──> WhatsApp Client ──> Filter Service ──> Message Processor ──> Publisher Service ──> Redis
                                            |                                        |
                                     (apply filters)                       (retry & queue)
```

## Message Flow

1. **Receive**: WhatsApp client receives message
2. **Filter**: Check if message passes configured filters
3. **Process**: Extract metadata (replies, forwards, mentions, etc.)
4. **Publish**: Send to appropriate Redis channel with retry logic
5. **Queue** (if needed): Store locally if Redis is unavailable

## Configuration

All configuration is done via environment variables. See `.env.example` in the project root for a complete list.

### Key Configuration Options

#### Filtering

```bash
# Save all messages (default)
FILTER_MODE=all

# Only save messages from specific contacts
FILTER_MODE=allowlist
FILTER_CONTACTS=1234567890@c.us,0987654321@c.us

# Exclude specific contacts
FILTER_MODE=blocklist
FILTER_CONTACTS=1234567890@c.us

# Only save group messages
FILTER_GROUPS=only

# Exclude group messages
FILTER_GROUPS=exclude

# Exclude broadcast messages (default)
FILTER_BROADCAST=false
```

#### Retry & Queue

```bash
# Retry up to 3 times with exponential backoff
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000
RETRY_BACKOFF_MULTIPLIER=2

# Queue up to 1000 messages locally if Redis is down
QUEUE_MAX_SIZE=1000
QUEUE_FLUSH_INTERVAL=60000  # Try to flush every minute
```

## Redis Channels

Messages are published to different channels based on their type:

| Channel | Message Type |
|---------|-------------|
| `memories:text:saved` | Text messages |
| `memories:image:saved` | Image messages (future) |
| `memories:video:saved` | Video messages (future) |
| `memories:audio:saved` | Audio/voice messages (future) |
| `memories:document:saved` | Document messages (future) |
| `memories:other:saved` | Other message types |

## Message Format

Each message published to Redis contains the following fields:

```typescript
{
  // Core fields
  messageId: string,           // Unique message ID
  chatId: string,              // Chat/conversation ID
  from: string,                // Sender phone/chat ID
  author: string,              // Actual sender (different in groups)
  timestamp: Date,             // Message timestamp
  text: string,                // Message body
  messageType: string,         // 'text', 'image', 'video', etc.
  
  // Flags
  isGroup: boolean,            // Is this a group chat?
  isBroadcast: boolean,        // Is this from a broadcast list?
  fromMe: boolean,             // Did we send this?
  hasMedia: boolean,           // Does it contain media?
  isForwarded: boolean,        // Is this forwarded?
  hasQuotedMsg: boolean,       // Is this a reply?
  
  // Reply context
  quotedMsgId?: string,        // ID of replied message
  quotedMsgBody?: string,      // Text of replied message
  
  // Mentions
  mentionedIds?: string[],     // @mentioned users
  
  // Group info (if applicable)
  groupName?: string,          // Group name
  participantCount?: number,   // Number of participants
  
  // Status
  ack?: number                 // Delivery status (0-4)
}
```

### Example Messages

**Simple text message:**
```json
{
  "messageId": "3EB0XXXXX",
  "chatId": "1234567890@c.us",
  "from": "1234567890@c.us",
  "author": "1234567890@c.us",
  "timestamp": "2026-01-22T21:30:00.000Z",
  "text": "Hello!",
  "messageType": "text",
  "isGroup": false,
  "isBroadcast": false,
  "fromMe": false,
  "hasMedia": false,
  "isForwarded": false,
  "hasQuotedMsg": false,
  "mentionedIds": [],
  "ack": 3
}
```

**Group reply with mention:**
```json
{
  "messageId": "3EB0YYYYY",
  "chatId": "1234567890-1234567890@g.us",
  "from": "1234567890-1234567890@g.us",
  "author": "0987654321@c.us",
  "timestamp": "2026-01-22T21:31:00.000Z",
  "text": "@John I agree!",
  "messageType": "text",
  "isGroup": true,
  "groupName": "Family Group",
  "participantCount": 5,
  "isBroadcast": false,
  "fromMe": false,
  "hasMedia": false,
  "isForwarded": false,
  "hasQuotedMsg": true,
  "quotedMsgId": "3EB0XXXXX",
  "quotedMsgBody": "What do you think?",
  "mentionedIds": ["1234567890@c.us"],
  "ack": 3
}
```

## Error Handling

The service implements a 3-tier error handling strategy:

### Tier 1: Log
- Errors are logged with context
- Service continues processing

### Tier 2: Retry with Backoff
- Failed Redis publishes are retried
- Exponential backoff (1s, 2s, 4s, ...)
- Configurable max attempts (default: 3)

### Tier 3: Local Queue
- If all retries fail, message is queued locally
- Queue is periodically flushed (default: every minute)
- Max queue size configurable (default: 1000 messages)
- On graceful shutdown, queue is flushed before exit

### Dead Letter Queue (Future)
- Messages that can't be delivered after queue is full
- Will be written to disk for manual recovery
- TODO: Not yet implemented

## Local Development

### Prerequisites
- Node.js 18+
- Redis running locally or accessible

### Setup

1. Navigate to service directory:
   ```bash
   cd services/whatsapp-collector
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set environment variables:
   ```bash
   export REDIS_HOST=localhost
   export REDIS_PORT=6379
   export DEBUG=true
   ```

4. Build TypeScript:
   ```bash
   npm run build
   ```

5. Run the service:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

6. Scan the QR code with your WhatsApp mobile app

7. Send a test message to your WhatsApp number

8. Monitor Redis to see published messages:
   ```bash
   redis-cli SUBSCRIBE memories:text:saved
   ```

## Docker Development

See the main project README for Docker instructions.

## Troubleshooting

### QR Code Not Appearing
- Check that Chromium is installed (required for Puppeteer)
- In Docker, ensure `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set
- Check logs for authentication errors

### Messages Not Being Saved
- Enable debug mode: `DEBUG=true`
- Check filter configuration
- Verify Redis connection: `redis-cli ping`
- Check logs for filter or processing errors

### Redis Connection Errors
- Verify Redis is running: `redis-cli ping`
- Check `REDIS_HOST` and `REDIS_PORT` configuration
- Check network connectivity (especially in Docker)
- Look for retry attempts and queue growth in logs

### High Queue Size
- Indicates Redis is unavailable or slow
- Check Redis health and performance
- Increase `QUEUE_MAX_SIZE` if needed
- Monitor `QUEUE_FLUSH_INTERVAL` for automatic recovery

### Authentication Session Lost
- Delete `.wwebjs_auth` directory
- Restart service and scan QR code again
- In Docker, ensure auth volume is properly mounted

## Future Enhancements

- [ ] Media message support (images, videos, audio, documents)
- [ ] S3 integration for media storage
- [ ] Dead letter queue for failed messages
- [ ] HTTP health check endpoint
- [ ] Prometheus metrics
- [ ] Unit and integration tests
- [ ] Message deduplication
- [ ] Rate limiting
- [ ] Multi-account support

## Links

- [Main Project README](../../README.md)
- [whatsapp-web.js Documentation](https://wwebjs.dev/)
- [Redis Pub/Sub](https://redis.io/topics/pubsub)
