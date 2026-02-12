import fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import { healthRoutes } from './routes/health';
import { searchRoutes } from './routes/search';
import { statsRoutes } from './routes/stats';

async function start() {
  const app = fastify({
    logger: true,
    genReqId: () => Math.random().toString(36).substring(2, 15)
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Request ID middleware
  app.addHook('onRequest', requestIdMiddleware);

  // Rate limiting
  await app.register(rateLimit, {
    max: config.rateLimit.maxRequests,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (request) => request.headers['authorization'] || request.ip,
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
