import fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import crypto, { randomUUID } from 'crypto';
import { config } from './config/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { healthRoutes } from './routes/health';
import { searchRoutes } from './routes/search';
import { statsRoutes } from './routes/stats';

const MAX_REQUEST_ID_LENGTH = 128;

function getRateLimitKey(request: { headers: Record<string, unknown>; ip: string }): string {
  const authHeader = request.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      return `token:${tokenHash}`;
    }
  }

  return `ip:${request.ip}`;
}

async function start() {
  const app = fastify({
    logger: true,
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string') {
        const trimmed = headerId.trim();
        if (trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH) {
          return trimmed;
        }
      }
      return randomUUID();
    }
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: config.rateLimit.maxRequests,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: getRateLimitKey,
    errorResponseBuilder: (req, context) => ({
      status: 'error',
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests, try again in ${context.after}`
      },
      request_id: req.id
    })
  });

  // Public routes (no auth)
  await app.register(healthRoutes);

  // Protected routes (require auth)
  app.addHook('onRequest', authMiddleware);
  await app.register(searchRoutes);
  await app.register(statsRoutes);

  try {
    await app.listen({ 
      port: config.server.port, 
      host: config.server.host 
    });
    logger.info({ 
      port: config.server.port, 
      host: config.server.host 
    }, 'Embedding API server started');
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
