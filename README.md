# Whatsapp-Memories

> A multi-service system for collecting, storing, and analyzing WhatsApp messages

Whatsapp-Memories is a modular architecture for capturing WhatsApp messages and making them available for downstream processing. Messages are collected in real-time, enriched with metadata, and published to Redis channels where other services can consume them.

## Overview

This project provides infrastructure for:

- **Message Collection**: Capture all incoming WhatsApp messages
- **Rich Metadata**: Extract replies, forwards, mentions, group info, and more
- **Flexible Filtering**: Choose which messages to save based on contact, group, or type
- **Reliable Delivery**: Retry logic and local queuing ensure no messages are lost
- **Type-Based Routing**: Different Redis channels for different message types
- **Extensible Architecture**: Add new services to process, store, or analyze messages

## Use Cases

- Personal message archive and search
- Family/group chat backup
- Business communication analytics
- Automated workflows triggered by messages
- Customer support message logging
- Research and conversation analysis

## Architecture

```
┌─────────────────┐
│  WhatsApp Web   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         WhatsApp Collector Service              │
│  ┌──────────┐  ┌─────────┐  ┌────────────────┐ │
│  │  Client  │──│ Filter  │──│   Processor    │ │
│  └──────────┘  └─────────┘  └────────┬───────┘ │
│                                       │         │
│                              ┌────────▼───────┐ │
│                              │   Publisher    │ │
│                              │ (retry+queue)  │ │
│                              └────────┬───────┘ │
└───────────────────────────────────────┼─────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │      Redis      │
                              │   (Pub/Sub)     │
                              └────────┬────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
    ┌──────────┐              ┌──────────────┐           ┌────────────────┐
    │  Storage │              │   Analytics  │           │  Your Service  │
    │  Service │              │    Service   │           │   (Future)     │
    │ (Future) │              │   (Future)   │           └────────────────┘
    └──────────┘              └──────────────┘
```

## Current Services

### WhatsApp Collector

The core service that connects to WhatsApp Web and publishes messages to Redis.

**Features:**

- Listens for incoming WhatsApp messages
- Filters messages based on configuration
- Extracts rich metadata (replies, forwards, mentions, etc.)
- Publishes to type-specific Redis channels
- Handles errors with retry and local queueing
- Graceful shutdown with queue flush

[View Service Documentation →](services/whatsapp-collector/README.md)

## Redis Channels

Messages are published to different channels based on their type:

| Channel                   | Purpose              | Status    |
| ------------------------- | -------------------- | --------- |
| `memories:text:saved`     | Text messages        | ✅ Active |
| `memories:image:saved`    | Image messages       | 🔜 Future |
| `memories:video:saved`    | Video messages       | 🔜 Future |
| `memories:audio:saved`    | Audio/voice messages | 🔜 Future |
| `memories:document:saved` | Document messages    | 🔜 Future |
| `memories:other:saved`    | Other message types  | ✅ Active |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- WhatsApp account
- (Optional) Redis CLI for testing

### Running with Docker (Recommended)

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd Whatsapp-Memories
   ```

2. **Configure (optional):**

   ```bash
   cp .env.example .env
   # Edit .env to customize filtering, retry behavior, etc.
   ```

3. **Start the services:**

   ```bash
   docker compose up --build
   ```

4. **Scan QR code:**
   - Watch the console output
   - A QR code will appear
   - Scan it with WhatsApp on your phone (Settings → Linked Devices → Link a Device)

5. **Verify it's working:**
   - Send a message to your WhatsApp number
   - Check the logs: `docker compose logs -f whatsapp-collector`
   - Or monitor Redis: `docker exec -it whatsapp-memories-redis redis-cli`
     ```
     SUBSCRIBE memories:text:saved
     ```

6. **Stop the services:**
   ```bash
   docker compose down
   ```

### Local Development (Without Docker)

See the [WhatsApp Collector README](services/whatsapp-collector/README.md#local-development) for local development instructions.

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and customize:

### Filter Messages

```bash
# Save all messages (default)
FILTER_MODE=all

# Only save specific contacts
FILTER_MODE=allowlist
FILTER_CONTACTS=1234567890@c.us,0987654321@c.us

# Exclude specific contacts
FILTER_MODE=blocklist
FILTER_CONTACTS=spammer@c.us

# Only groups
FILTER_GROUPS=only

# No groups
FILTER_GROUPS=exclude

# Include/exclude broadcasts
FILTER_BROADCAST=false
```

### Retry & Queue Behavior

```bash
# Retry failed Redis publishes
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000
RETRY_BACKOFF_MULTIPLIER=2

# Queue messages locally if Redis is down
QUEUE_MAX_SIZE=1000
QUEUE_FLUSH_INTERVAL=60000
```

### Debug Mode

```bash
# Enable detailed logging
DEBUG=true
```

See [.env.example](.env.example) for all options with descriptions.

## Message Format

Each message published to Redis contains:

```typescript
{
  // Core fields
  messageId: string,           // Unique message ID
  chatId: string,              // Chat ID
  from: string,                // Sender
  author: string,              // Actual sender (different in groups)
  timestamp: Date,             // When sent
  text: string,                // Message body
  messageType: string,         // 'text', 'image', etc.

  // Flags
  isGroup: boolean,            // Group chat?
  isBroadcast: boolean,        // Broadcast list?
  fromMe: boolean,             // Sent by us?
  hasMedia: boolean,           // Contains media?
  isForwarded: boolean,        // Forwarded message?
  hasQuotedMsg: boolean,       // Reply to another message?

  // Context
  quotedMsgId?: string,        // ID of replied message
  quotedMsgBody?: string,      // Text of replied message
  mentionedIds?: string[],     // @mentioned users

  // Group info (if applicable)
  groupName?: string,          // Group name
  participantCount?: number,   // Number of members

  // Status
  ack?: number                 // Delivery status (0-4)
}
```

### Example

```json
{
  "messageId": "3EB0ABC123",
  "chatId": "1234567890@c.us",
  "from": "1234567890@c.us",
  "author": "1234567890@c.us",
  "timestamp": "2026-01-22T21:30:00.000Z",
  "text": "Hello, world!",
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

## Testing

### Manual Testing

1. **Start services:**

   ```bash
   docker compose up
   ```

2. **Scan QR code and wait for "ready" message**

3. **Send test message to your WhatsApp**

4. **Monitor Redis:**

   ```bash
   docker exec -it whatsapp-memories-redis redis-cli SUBSCRIBE memories:text:saved
   ```

5. **Check message appears in Redis output**

### Test Filtering

1. **Configure a filter** in `.env`:

   ```bash
   FILTER_MODE=allowlist
   FILTER_CONTACTS=1234567890@c.us
   ```

2. **Restart services:**

   ```bash
   docker compose down
   docker compose up
   ```

3. **Send messages from both allowed and non-allowed contacts**

4. **Verify only allowed messages appear in Redis**

### Test Error Handling

1. **Stop Redis while service is running:**

   ```bash
   docker compose stop redis
   ```

2. **Send messages (they will be queued)**

3. **Check collector logs for queue messages:**

   ```bash
   docker compose logs whatsapp-collector
   ```

4. **Restart Redis:**

   ```bash
   docker compose start redis
   ```

5. **Watch logs for queue flush**

## Project Structure

```
Whatsapp-Memories/
├── services/
│   └── whatsapp-collector/          # Message collection service
│       ├── src/
│       │   ├── clients/              # WhatsApp Web client
│       │   ├── services/             # Core business logic
│       │   │   ├── FilterService.ts
│       │   │   ├── PublisherService.ts
│       │   │   └── MessageProcessor.ts
│       │   ├── config/               # Configuration
│       │   ├── types/                # TypeScript types
│       │   ├── utils/                # Logger, retry logic
│       │   └── WhatsAppCollectorService.ts  # Main entry
│       ├── Dockerfile
│       ├── package.json
│       └── README.md
│
├── docker-compose.yml                # Orchestration
├── .env.example                      # Configuration template
├── .gitignore
├── LICENSE
└── README.md                         # This file
```

## Adding New Services

To add a new service that consumes messages:

1. **Create service directory:**

   ```bash
   mkdir -p services/your-service
   ```

2. **Implement Redis subscriber:**

   ```typescript
   import { createClient } from "redis";

   const subscriber = createClient({ url: "redis://redis:6379" });
   await subscriber.connect();

   await subscriber.subscribe("memories:text:saved", (message) => {
     const data = JSON.parse(message);
     // Process message...
   });
   ```

3. **Add to docker-compose.yml:**

   ```yaml
   your-service:
     build: ./services/your-service
     depends_on:
       redis:
         condition: service_healthy
     environment:
       - REDIS_HOST=redis
     networks:
       - whatsapp-memories-network
   ```

4. **Start:**
   ```bash
   docker compose up --build
   ```

## Monitoring & Debugging

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f whatsapp-collector

# Last 100 lines
docker compose logs --tail=100 whatsapp-collector
```

### Enable Debug Mode

In `docker-compose.yml` or `.env`:

```bash
DEBUG=true
```

### Monitor Redis

```bash
# Subscribe to all channels
docker exec -it whatsapp-memories-redis redis-cli
> PSUBSCRIBE memories:*

# Check Redis stats
docker exec -it whatsapp-memories-redis redis-cli INFO

# See active channels
docker exec -it whatsapp-memories-redis redis-cli PUBSUB CHANNELS
```

### Check Service Health

```bash
# Check if Redis is responding
docker exec -it whatsapp-memories-redis redis-cli PING

# Check if collector is running
docker ps | grep whatsapp-collector

# Check resource usage
docker stats
```

## Troubleshooting

### QR Code Not Appearing

- Check logs: `docker compose logs whatsapp-collector`
- Ensure Chromium is installed in container
- Try rebuilding: `docker compose up --build`

### Messages Not Being Saved

- Enable debug: `DEBUG=true`
- Check filter configuration
- Verify Redis is running: `docker ps`
- Monitor Redis: `docker exec -it whatsapp-memories-redis redis-cli PING`

### Authentication Lost

- Delete auth data: `rm -rf services/whatsapp-collector/.wwebjs_auth`
- Restart: `docker compose restart whatsapp-collector`
- Scan QR code again

### High Memory Usage

- WhatsApp Web client uses Chromium (memory-intensive)
- Typical usage: 200-500MB for collector
- Consider adding memory limits in docker-compose.yml if needed

### Container Keeps Restarting

- Check logs: `docker compose logs whatsapp-collector`
- Common issues:
  - Redis not ready (wait for healthcheck)
  - Missing environment variables
  - Authentication failure (rescan QR)

## Security Considerations

### WhatsApp Authentication

- Auth tokens stored in `.wwebjs_auth/`
- **Never commit this directory to git** (already in .gitignore)
- In production, use volume mounts with proper permissions

### Redis Security

- Default setup has no password (development only)
- For production:
  - Enable Redis password: `requirepass your-password`
  - Use TLS for Redis connections
  - Restrict network access

### Environment Variables

- Never commit `.env` files
- Use secrets management in production (Docker secrets, Kubernetes secrets, etc.)
- Rotate credentials regularly

### Encryption at Rest

The system supports AES-256-GCM encryption for sensitive message data:

**Encrypted Fields:**
- `text` - Message content
- `sender_number` - Phone numbers (PII)
- `author` - Raw WhatsApp IDs
- `quoted_msg_body` - Quoted message content
- `media_url` - Media file URLs
- `caption` - Media captions
- `mentioned_ids` - Mentioned user IDs

**Queryable Fields (Plaintext):**
- `sender_name` - Contact names (filterable)
- `sender_pushname` - Display names
- `timestamp` - Message timestamps
- `group_name` - Group chat names
- `embedding` - Vector embeddings (semantic search)

**Setup:**

1. Generate encryption key:
   ```bash
   openssl rand -hex 32
   ```

2. Add to environment:
   ```bash
   ENCRYPTION_KEY=your-64-character-hex-key
   ```

3. Restart services

**⚠️ CRITICAL WARNINGS:**

- **Key Loss = Data Loss**: If you lose the encryption key, encrypted data cannot be recovered. Back up the key securely (password manager, HSM, etc.).
- **No Key Rotation**: Currently no built-in key rotation. Plan your key management strategy before deployment.
- **Backward Compatible**: Existing plaintext messages remain readable. New messages are automatically encrypted.
- **Performance**: ~3ms overhead per field encryption/decryption.

### Network Isolation

- Services communicate via Docker network
- Only Redis port exposed by default
- Add firewall rules as needed

## Roadmap

### v1.0 (Current)

- [x] WhatsApp message collection
- [x] Text message support
- [x] Redis pub/sub integration
- [x] Message filtering
- [x] Retry and queue logic
- [x] Docker support
- [x] Comprehensive documentation

### v1.1 (Next)

- [ ] Media message support (images, videos, audio)
- [ ] S3 integration for media storage
- [ ] Dead letter queue for failed messages
- [ ] Health check HTTP endpoint
- [ ] Prometheus metrics

### v2.0 (Future)

- [ ] Message storage service (PostgreSQL/MongoDB)
- [ ] Search service (Elasticsearch)
- [ ] Web UI for viewing messages
- [ ] Analytics dashboard
- [ ] Message export functionality
- [ ] Multi-account support

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API wrapper
- [Redis](https://redis.io/) - In-memory data store
- [Puppeteer](https://pptr.dev/) - Headless Chrome automation

## Support

- **Documentation**: See service-specific READMEs in `services/` directories
- **Issues**: Open an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions

## Disclaimer

This project is not affiliated with, endorsed by, or associated with WhatsApp or Meta Platforms, Inc. Use at your own risk and ensure compliance with WhatsApp's Terms of Service.

---
