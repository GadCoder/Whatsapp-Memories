import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SearchService } from '../services/SearchService';
import { StatsResponse } from '../types/search.types';
import { config } from '../config/config';

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  const searchService = new SearchService();

  fastify.get('/api/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const { total, withEmbeddings } = await searchService.getStats();

    return {
      status: 'success',
      total_messages: total,
      messages_with_embeddings: withEmbeddings,
      embedding_provider: config.openai.model,
      timestamp: new Date().toISOString()
    } as StatsResponse;
  });
}
