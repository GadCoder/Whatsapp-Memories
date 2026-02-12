import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Use existing request ID or generate new one
  const requestId = request.headers['x-request-id'] as string || uuidv4();
  request.id = requestId;
  reply.header('x-request-id', requestId);
}
