import { pool } from '../database/connection';
import { EncryptionService } from './EncryptionService';
import { logger } from '../utils/logger';
import { SearchResult } from '../types/search.types';
import { AppError, ErrorCodes } from '../utils/errors';
import pgvector from 'pgvector/pg';

interface SearchFilters {
  start_date?: string;
  end_date?: string;
  chat_id?: string;
  is_group?: boolean;
}

export class SearchService {
  private encryptionService: EncryptionService;

  constructor() {
    this.encryptionService = new EncryptionService();
  }

  /**
   * Search for similar messages using pgvector
   */
  async search(
    embedding: number[],
    limit: number,
    filters?: SearchFilters
  ): Promise<{ results: SearchResult[]; timeMs: number }> {
    const startTime = Date.now();

    try {
      const query = `
        SELECT 
          id, message_id, sender_name, text, timestamp,
          embedding <=> $1 as distance
        FROM messages
        WHERE 
          embedding IS NOT NULL
          AND ($2::date IS NULL OR timestamp >= $2::date)
          AND ($3::date IS NULL OR timestamp < ($3::date + INTERVAL '1 day'))
          AND ($4::uuid IS NULL OR chat_id = $4)
          AND ($5::boolean IS NULL OR is_group = $5)
        ORDER BY embedding <=> $1
        LIMIT LEAST($6, 100)
      `;

      const result = await pool.query(query, [
        pgvector.toSql(embedding),
        filters?.start_date || null,
        filters?.end_date || null,
        filters?.chat_id || null,
        filters?.is_group !== undefined ? filters.is_group : null,
        limit
      ]);

      const searchTimeMs = Date.now() - startTime;

      // Decrypt messages (with graceful failure)
      const results: SearchResult[] = await Promise.all(
        result.rows.map(async (row) => ({
          id: row.id,
          text: await this.encryptionService.decrypt(row.text),
          sender_name: row.sender_name,
          timestamp: row.timestamp,
          similarity: Math.max(0, Math.min(1, 1 - parseFloat(row.distance)))
        }))
      );

      logger.info({ 
        resultsCount: results.length, 
        searchTimeMs,
        filters: filters ? Object.keys(filters).join(',') : 'none'
      }, 'Search completed');

      return { results, timeMs: searchTimeMs };
    } catch (error) {
      logger.error({ error }, 'Search failed');
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        ErrorCodes.DATABASE_ERROR.code,
        ErrorCodes.DATABASE_ERROR.message,
        ErrorCodes.DATABASE_ERROR.statusCode
      );
    }
  }

  /**
   * Get statistics about embeddings
   */
  async getStats(): Promise<{ total: number; withEmbeddings: number }> {
    try {
      const totalResult = await pool.query('SELECT COUNT(*) FROM messages');
      const withEmbeddingsResult = await pool.query(
        'SELECT COUNT(*) FROM messages WHERE embedding IS NOT NULL'
      );

      return {
        total: parseInt(totalResult.rows[0].count, 10),
        withEmbeddings: parseInt(withEmbeddingsResult.rows[0].count, 10)
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      throw new AppError(
        ErrorCodes.DATABASE_ERROR.code,
        ErrorCodes.DATABASE_ERROR.message,
        ErrorCodes.DATABASE_ERROR.statusCode
      );
    }
  }
}
