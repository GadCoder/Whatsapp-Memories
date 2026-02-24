import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ThreadService } from '../services/ThreadService';

interface ThreadQuery {
  anchor_message_id: string;
}

export async function threadRoutes(fastify: FastifyInstance): Promise<void> {
  const threadService = new ThreadService();

  fastify.get('/api/messages/thread', async (
    request: FastifyRequest<{ Querystring: ThreadQuery }>,
    reply: FastifyReply
  ) => {
    const { anchor_message_id: anchorMessageId } = request.query;

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

    const payload = await threadService.getThreadAroundAnchor(anchorMessageId.trim());

    return {
      status: 'success',
      ...payload,
      request_id: request.id,
    };
  });
}
