import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const headerValue = request.headers['x-request-id'];
  const MAX_REQUEST_ID_LENGTH = 128;
  let requestId = uuidv4();

  if (typeof headerValue === 'string') {
    const trimmed = headerValue.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH) {
      requestId = trimmed;
    }
  }

  request.id = requestId;
  reply.header('x-request-id', requestId);
}
