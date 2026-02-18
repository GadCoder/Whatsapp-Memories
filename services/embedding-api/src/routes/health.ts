import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyDatabase } from '../database/connection';
import { logger } from '../utils/logger';
import { HealthResponse } from '../types/search.types';
import { ErrorCodes } from '../utils/errors';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { connected, indexPresent } = await verifyDatabase();
      
      if (!connected) {
        return reply.status(503).send({
          status: 'error',
          error: { 
            code: ErrorCodes.UNHEALTHY.code, 
            message: 'Database connection failed' 
          }
        } as HealthResponse);
      }
      
      if (!indexPresent) {
        return reply.status(503).send({
          status: 'error',
          error: { 
            code: ErrorCodes.INDEX_MISSING.code, 
            message: 'pgvector index not found' 
          }
        } as HealthResponse);
      }
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        index: 'present'
      } as HealthResponse;
    } catch (err) {
      logger.error({ err }, 'Health check failed');
      return reply.status(503).send({
        status: 'error',
        error: { 
          code: ErrorCodes.UNHEALTHY.code, 
          message: 'Service unavailable' 
        }
      } as HealthResponse);
    }
  });
}
