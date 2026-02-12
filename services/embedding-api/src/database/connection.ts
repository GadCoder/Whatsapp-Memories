import { Pool } from 'pg';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: config.database.poolSize,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  idleTimeoutMillis: config.database.idleTimeoutMillis
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function checkIndex(): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'messages_embedding_idx'
    `);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err }, 'Failed to check for index');
    return false;
  }
}

export async function verifyDatabase(): Promise<{ connected: boolean; indexPresent: boolean }> {
  try {
    await pool.query('SELECT 1');
    const indexPresent = await checkIndex();
    return { connected: true, indexPresent };
  } catch (err) {
    logger.error({ err }, 'Database verification failed');
    return { connected: false, indexPresent: false };
  }
}
