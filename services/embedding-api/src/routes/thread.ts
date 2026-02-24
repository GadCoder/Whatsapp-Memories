import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ThreadService } from '../services/ThreadService';

interface ThreadQuery {
  anchor_message_id: string;
  limit?: number;
}

export async function threadRoutes(fastify: FastifyInstance): Promise<void> {
  const threadService = new ThreadService();

  fastify.get('/api/messages/thread', async (
    request: FastifyRequest<{ Querystring: ThreadQuery }>,
    reply: FastifyReply
  ) => {
    const { anchor_message_id: anchorMessageId, limit } = request.query;

    if (!anchorMessageId || anchorMessageId.trim().length === 0) {
      return reply.status(400).send({
        status: 'error',
        error: {
          code: 'INVALID_REQUEST',
          message: 'anchor_message_id is required',
        },
        request_id: request.id,
      });
    }

    try {
      const payload = await threadService.getThreadAroundAnchor(anchorMessageId.trim(), limit);

      return {
        status: 'success',
        ...payload,
        request_id: request.id,
      };
    } catch {
      return reply.status(503).send({
        status: 'error',
        error: {
          code: 'DATABASE_ERROR',
          message: 'Database error',
        },
        request_id: request.id,
      });
    }
  });
}
