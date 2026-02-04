-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    author TEXT,
    text TEXT NOT NULL,
    
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
        WHERE table_name = 'messages' AND column_name = 'sender_name'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'sender_pushname'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_pushname TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'sender_number'
    ) THEN
        ALTER TABLE messages ADD COLUMN sender_number TEXT;
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
