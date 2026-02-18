export interface SearchRequest {
  query: string;
  limit?: number;
  filters?: {
    start_date?: string;
    end_date?: string;
    chat_id?: string;
    is_group?: boolean;
  };
}

export interface SearchResult {
  id: string;
  text: string | null;
  sender_name: string | null;
  timestamp: string;
  similarity: number;
}

export interface SearchResponse {
  status: 'success';
  results: SearchResult[];
  query_embedding_time_ms: number;
  search_time_ms: number;
  total_time_ms: number;
  request_id: string;
}

export interface ErrorResponse {
  status: 'error';
  error: {
    code: string;
    message: string;
  };
  request_id: string;
}

export interface StatsResponse {
  status: 'success';
  total_messages: number;
  messages_with_embeddings: number;
  embedding_provider: string;
  timestamp: string;
}

export interface HealthResponse {
  status: 'healthy' | 'error';
  timestamp?: string;
  database?: string;
  index?: string;
  error?: {
    code: string;
    message: string;
  };
}
