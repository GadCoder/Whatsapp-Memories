# Message Storage Service

A microservice that listens to WhatsApp messages from Redis pub/sub and stores them in PostgreSQL with vector embeddings for semantic search and RAG applications.

## Features

- ✅ **Persistent Storage**: Saves all WhatsApp messages to PostgreSQL
- ✅ **Vector Embeddings**: Generates embeddings for semantic search
- ✅ **Multiple Providers**: Supports OpenAI and Google Gemini
- ✅ **Automatic Fallback**: Resilient provider failover
- ✅ **pgvector Integration**: Efficient similarity search with indexes
- ✅ **Retry Logic**: Handles transient failures gracefully
- ✅ **Performance Monitoring**: Per-provider statistics
- ✅ **Docker Support**: Easy deployment

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Redis (from main docker-compose.yml)
- PostgreSQL with pgvector (from main docker-compose.yml)
- OpenAI or Google Gemini API key

### Configuration

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Set your embedding provider and API key:**

   **Option A: OpenAI (Recommended)**
   ```bash
   EMBEDDING_PROVIDER=openai
   OPENAI_API_KEY=sk-your-api-key-here
   ```

   **Option B: Google Gemini (Cost-Effective)**
   ```bash
   EMBEDDING_PROVIDER=gemini
   GEMINI_API_KEY=your-gemini-api-key-here
   ```

   **Option C: Both with Fallback (Most Resilient)**
   ```bash
   EMBEDDING_PROVIDER=openai
   EMBEDDING_FALLBACK_PROVIDER=gemini
   OPENAI_API_KEY=sk-your-key
   GEMINI_API_KEY=your-key
   ```

3. **Start the service:**
   ```bash
   # From project root
   docker compose up message-storage
   ```

---

## Embedding Providers

This service supports multiple embedding providers with automatic failover.

### Supported Providers

| Provider | Model | Dimensions | Cost/1M tokens | Best For |
|----------|-------|------------|----------------|----------|
| **OpenAI** | text-embedding-3-small | 1536 | $0.020 | Production RAG, quality |
| **Gemini** | text-embedding-004 | 768→1536 | ~$0.002 | High volume, cost savings |

### Quick Comparison

**OpenAI:**
- ✅ Proven quality for RAG
- ✅ Industry standard
- ✅ Excellent consistency
- 💰 $0.02 per 1M tokens

**Gemini:**
- ✅ 10-20x cheaper
- ✅ Good quality
- ⚠️ Less proven for RAG
- 💰 ~$0.002 per 1M tokens

**📚 Detailed Guide:** See [Embedding Provider Guide](../../docs/EMBEDDING-PROVIDERS.md)

---

## Architecture

```
┌─────────────────┐
│  Redis Pub/Sub  │
│ memories:*:saved│
└────────┬────────┘
         │
         ▼
┌────────────────────────────────┐
│   Message Storage Service      │
│                                │
│  ┌──────────────────────────┐ │
│  │   SubscriberService      │ │
│  │  (Redis Subscriber)      │ │
│  └──────────┬───────────────┘ │
│             │                  │
│  ┌──────────▼───────────────┐ │
│  │   EmbeddingService       │ │
│  │  ┌────────────────────┐  │ │
│  │  │ Primary Provider   │  │ │
│  │  │ (OpenAI/Gemini)    │  │ │
│  │  └────────────────────┘  │ │
│  │  ┌────────────────────┐  │ │
│  │  │ Fallback Provider  │  │ │
│  │  │ (Optional)         │  │ │
│  │  └────────────────────┘  │ │
│  └──────────┬───────────────┘ │
│             │                  │
│  ┌──────────▼───────────────┐ │
│  │   StorageService         │ │
│  │  (PostgreSQL + pgvector) │ │
│  └──────────────────────────┘ │
└────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   + pgvector    │
└─────────────────┘
```

---

## Database Schema

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Embedding data
    embedding vector(1536),          -- Vector embedding
    embedding_provider TEXT,         -- 'openai' or 'gemini'
    
    -- ... other fields ...
);

-- Indexes
CREATE INDEX idx_messages_embedding 
    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_messages_embedding_provider 
    ON messages(embedding_provider);
```

---

## Configuration Reference

### Embedding Provider Settings

```bash
# Primary provider
EMBEDDING_PROVIDER=openai          # or 'gemini'

# Fallback provider (optional)
EMBEDDING_FALLBACK_PROVIDER=gemini # or 'openai'

# Startup strictness for embeddings
# false: degraded mode (store messages without embeddings if provider unavailable)
# true: fail startup when no embedding provider can be initialized
EMBEDDINGS_REQUIRED=false

# OpenAI Configuration
OPENAI_API_KEY=sk-xxx
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Gemini Configuration
GEMINI_API_KEY=xxx
GEMINI_EMBEDDING_MODEL=text-embedding-004
```

### Database Settings

```bash
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=memories
POSTGRES_USER=memories
POSTGRES_PASSWORD=your-secure-password
```

### Redis Settings

```bash
REDIS_HOST=redis
REDIS_PORT=6379
```

### Debug Mode

```bash
DEBUG=true  # Enable detailed logging
```

---

## Development

### Local Setup (Without Docker)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up PostgreSQL with pgvector:**
   ```bash
   # Install PostgreSQL
   # Install pgvector extension
   # Create database
   createdb memories
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with local settings
   ```

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

### Build

```bash
npm run build
```

### Scripts

```bash
npm run dev              # Development mode with ts-node
npm run build            # Compile TypeScript
npm start                # Run compiled JavaScript
npm run test-embeddings  # Compare embedding providers
```

---

## Monitoring

### Statistics Logging

The service logs statistics every 5 minutes:

```
[Stats] -----------------------------------------
[Stats] Session: 1,234 messages processed, 2 errors
[Stats] Database: 10,450 total messages, 10,400 with embeddings
[Stats] Embeddings by provider:
[Stats]   openai: 9,234 messages
[Stats]   gemini: 1,166 messages
[Stats] Provider performance:
[Stats]   openai: 9,234/9,234 requests (100% success), 245ms avg
[Stats]   gemini: 1,166/1,200 requests (97.2% success), 312ms avg
[Stats] -----------------------------------------
```

### Health Checks

Monitor logs for:
- `[Startup] Service started successfully` - Service is ready
- `[Handler] Processed message` - Messages being processed
- `[EmbeddingService] Trying fallback provider` - Fallback activated
- `[Storage] Saved message` - Database writes successful

---

## Testing

### Test Embedding Providers

Compare OpenAI and Gemini performance:

```bash
# Set both API keys
export OPENAI_API_KEY=sk-your-key
export GEMINI_API_KEY=your-key

# Run comparison test
npm run test-embeddings
```

**Test output:**
- Latency comparison
- Consistency testing
- Semantic similarity
- Dimension analysis
- Recommendations

### Manual Testing

1. **Start services:**
   ```bash
   docker compose up redis postgres message-storage
   ```

2. **Publish a test message to Redis:**
   ```bash
   docker exec -it whatsapp-memories-redis redis-cli
   > PUBLISH memories:text:saved '{"messageId":"test123","chatId":"test@c.us","from":"test@c.us","text":"Hello world","timestamp":"2026-01-31T12:00:00Z","messageType":"text","isGroup":false,"fromMe":false,"hasMedia":false,"isForwarded":false,"hasQuotedMsg":false,"isBroadcast":false,"mentionedIds":[]}'
   ```

3. **Verify in logs:**
   ```bash
   docker compose logs -f message-storage
   ```

4. **Check database:**
   ```bash
   docker exec -it whatsapp-memories-postgres psql -U memories -d memories
   memories=# SELECT message_id, embedding_provider FROM messages WHERE message_id = 'test123';
   ```

---

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
docker compose logs message-storage
```

**Common issues:**

1. **Missing API Key:**
   - With `EMBEDDINGS_REQUIRED=false`, service starts in degraded mode and stores messages without embeddings.
   - With `EMBEDDINGS_REQUIRED=true`, startup fails until a valid provider key is configured.

2. **Database Connection Failed:**
   ```
   Error: Failed to initialize database
   ```
   → Ensure PostgreSQL is running and accessible

3. **Redis Connection Failed:**
   ```
   Error: Connecting to Redis...
   ```
   → Ensure Redis is running

### No Embeddings Generated

**Check provider configuration:**
```bash
# In .env
EMBEDDING_PROVIDER=openai  # Check this is set correctly
OPENAI_API_KEY=sk-xxx      # Verify key is correct
```

**Test API key:**
```bash
npm run test-embeddings
```

### High Error Rate

**Check provider stats in logs:**
```
[Stats] Provider performance:
[Stats]   openai: 50/100 requests (50% success)  ← Low success rate
```

**Possible causes:**
- Invalid API key
- Rate limiting
- Network issues
- API outages

**Solution:** Configure fallback provider

---

## Performance Tips

### Optimize for High Volume

1. **Use Gemini for cost savings:**
   ```bash
   EMBEDDING_PROVIDER=gemini
   ```

2. **Enable fallback for resilience:**
   ```bash
   EMBEDDING_PROVIDER=gemini
   EMBEDDING_FALLBACK_PROVIDER=openai
   ```

3. **Monitor provider stats** to identify issues early

### Optimize Database

- Regular VACUUM on messages table
- Monitor index usage
- Consider partitioning for >1M messages

---

## Security

### API Keys

- **Never commit** `.env` files
- Use secrets management in production (Docker secrets, K8s secrets)
- Rotate keys periodically

### Database

- Use strong passwords
- Enable SSL for PostgreSQL connections
- Restrict network access

---

## Roadmap

- [ ] Batch embedding optimization
- [ ] Additional providers (Cohere, Voyage AI)
- [ ] Local/self-hosted models
- [ ] Embedding re-generation tool
- [ ] Cost tracking dashboard
- [ ] Advanced filtering (by provider, date range)

---

## Resources

- **Main Documentation**: [Embedding Provider Guide](../../docs/EMBEDDING-PROVIDERS.md)
- **Project Repository**: [GitHub](https://github.com/your-repo/whatsapp-memories)
- **OpenAI Docs**: https://platform.openai.com/docs/guides/embeddings
- **Gemini Docs**: https://ai.google.dev/gemini-api/docs/embeddings
- **pgvector**: https://github.com/pgvector/pgvector

---

## License

MIT License - see [LICENSE](../../LICENSE) for details
