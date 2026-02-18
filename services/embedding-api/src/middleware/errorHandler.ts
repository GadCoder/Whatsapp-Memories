import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;
  
  if (error instanceof AppError) {
    logger.warn({ 
      error: error.message, 
      code: error.code, 
      requestId,
      path: request.routerPath 
    }, 'Application error');
    
    reply.status(error.statusCode).send({
      status: 'error',
      error: {
        code: error.code,
        message: error.message
      },
      request_id: requestId
    });
    return;
  }
  
  // Unexpected error
  logger.error({ 
    error: error.message, 
    stack: error.stack,
    requestId,
    path: request.routerPath 
  }, 'Unexpected error');
  
  reply.status(500).send({
    status: 'error',
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    },
    request_id: requestId
  });
}
