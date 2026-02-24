-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    author TEXT,
    text TEXT,  -- Nullable: media messages may not have text
    
    -- Contact information (self-healing: added via ALTER TABLE for existing deployments)
    sender_name TEXT,
    sender_pushname TEXT,
    sender_number TEXT,
    
    message_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Group metadata
    is_group BOOLEAN DEFAULT FALSE,
    group_name TEXT,
    participant_count INTEGER,
    
    -- Message status
    from_me BOOLEAN DEFAULT FALSE,
    recipient TEXT,  -- Recipient for outbound messages (when from_me=true)
    is_forwarded BOOLEAN DEFAULT FALSE,
    is_broadcast BOOLEAN DEFAULT FALSE,
    
    -- Reply context
    has_quoted_msg BOOLEAN DEFAULT FALSE,
    quoted_msg_id TEXT,
    quoted_msg_body TEXT,
    mentioned_ids TEXT[],
    
    -- Media fields
    has_media BOOLEAN DEFAULT FALSE,
    media_type TEXT,
    media_url TEXT,
    caption TEXT,
    mime_type TEXT,
    file_size INTEGER,
    
    -- Vector embedding (1536 dimensions - supports both OpenAI and padded Gemini)
    embedding vector(1536),
    
    -- Track which provider generated this embedding
    embedding_provider TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Self-healing: Add contact columns if they don't exist (for existing deployments)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'sender_name' AND table_schema = 'public'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'sender_pushname' AND table_schema = 'public'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_pushname TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'sender_number' AND table_schema = 'public'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_number TEXT;
    END IF;
    
    -- Self-healing: Make text column nullable (for encryption with media messages)
    -- This allows null text for media-only messages where encryption returns null
    ALTER TABLE messages ALTER COLUMN text DROP NOT NULL;
    
    -- Self-healing: Add recipient column for outbound messages
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'recipient' AND table_schema = 'public'
    ) THEN
        ALTER TABLE messages ADD COLUMN recipient TEXT;
    END IF;
END $$;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_is_group ON messages(is_group);
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type);

-- Vector similarity index (IVFFlat for speed)
-- Note: This index works best when table has > 1000 rows
-- For smaller tables, exact search is used automatically
CREATE INDEX IF NOT EXISTS idx_messages_embedding ON messages 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index on provider for analytics and filtering
CREATE INDEX IF NOT EXISTS idx_messages_embedding_provider ON messages(embedding_provider) 
    WHERE embedding_provider IS NOT NULL;

-- Conversation aggregates (encrypted summaries + participant snapshots)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_key TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    start_message_id TEXT NOT NULL,
    end_message_id TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,

    -- Encrypted fields (AES-GCM via app layer)
    participants_encrypted TEXT,
    summary_encrypted TEXT,
    title_encrypted TEXT,

    -- Operational metadata (plaintext)
    topic_label TEXT,
    classification_confidence REAL,
    status TEXT NOT NULL DEFAULT 'open',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_conversations_start_message
      FOREIGN KEY (start_message_id) REFERENCES messages(message_id) ON DELETE RESTRICT,
    CONSTRAINT fk_conversations_end_message
      FOREIGN KEY (end_message_id) REFERENCES messages(message_id) ON DELETE RESTRICT,
    CONSTRAINT chk_conversations_time_range CHECK (ended_at >= started_at),
    CONSTRAINT chk_conversations_status CHECK (status IN ('open', 'closed', 'merged')),
    CONSTRAINT chk_conversations_message_count CHECK (message_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_conversations_chat_time
  ON conversations(chat_id, started_at, ended_at);

CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_conversations_start_message_id
  ON conversations(start_message_id);

CREATE INDEX IF NOT EXISTS idx_conversations_end_message_id
  ON conversations(end_message_id);

-- Membership bridge for deterministic thread reconstruction
CREATE TABLE IF NOT EXISTS conversation_messages (
    conversation_id UUID NOT NULL,
    message_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (conversation_id, message_id),
    CONSTRAINT fk_conversation_messages_conversation
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_messages_message
      FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_message_id
  ON conversation_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_timestamp
  ON conversation_messages(timestamp);
