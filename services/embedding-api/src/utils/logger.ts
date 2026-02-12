import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'embedding-api' },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      requestId: req.id
    })
  },
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
});
