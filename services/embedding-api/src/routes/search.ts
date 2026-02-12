import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EmbeddingService } from '../services/EmbeddingService';
import { SearchService } from '../services/SearchService';
import { searchSchema } from '../schemas/search.schema';
import { SearchRequest, SearchResponse } from '../types/search.types';
import { logger } from '../utils/logger';
import { AppError, ErrorCodes } from '../utils/errors';

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const embeddingService = new EmbeddingService();
  const searchService = new SearchService();

  fastify.post('/api/search/similar', { schema: searchSchema }, async (
    request: FastifyRequest<{ Body: SearchRequest }>,
    reply: FastifyReply
  ) => {
    const totalStartTime = Date.now();
    const { query, limit = 10, filters } = request.body;

    try {
      // Generate embedding for the query
      const { embedding, timeMs: embeddingTimeMs } = await embeddingService.generateEmbedding(query);

      // Search for similar messages
      const { results, timeMs: searchTimeMs } = await searchService.search(
        embedding,
        limit,
        filters
      );

      const totalTimeMs = Date.now() - totalStartTime;

      logger.info({
        queryLength: query.length,
        resultsCount: results.length,
        embeddingTimeMs,
        searchTimeMs,
        totalTimeMs,
        requestId: request.id
      }, 'Search completed');

      return {
        status: 'success',
        results,
        query_embedding_time_ms: embeddingTimeMs,
        search_time_ms: searchTimeMs,
        total_time_ms: totalTimeMs,
        request_id: request.id
      } as SearchResponse;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error({ error, queryLength: query.length }, 'Search failed');
      throw new AppError(
        ErrorCodes.DATABASE_ERROR.code,
        ErrorCodes.DATABASE_ERROR.message,
        ErrorCodes.DATABASE_ERROR.statusCode
      );
    }
  });
}
