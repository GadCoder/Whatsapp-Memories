import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ErrorCodes } from '../utils/errors';

function validateToken(provided: string, expected: string): boolean {
  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = request.headers.authorization;
  
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.status(401).send({
      status: 'error',
      error: { 
        code: ErrorCodes.UNAUTHORIZED.code, 
        message: ErrorCodes.UNAUTHORIZED.message 
      },
      request_id: request.id
    });
  }
  
  const token = auth.slice(7);
  
  if (!validateToken(token, config.auth.apiToken)) {
    logger.warn({ path: request.routerPath, requestId: request.id }, 'Authentication failed');
    return reply.status(401).send({
      status: 'error',
      error: { 
        code: ErrorCodes.UNAUTHORIZED.code, 
        message: ErrorCodes.UNAUTHORIZED.message 
      },
      request_id: request.id
    });
  }
}
