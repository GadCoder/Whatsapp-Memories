import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('[Database] Unexpected pool error:', err);
    });
  }
  return pool;
}

export async function initializeDatabase(): Promise<void> {
  const pool = getPool();
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    console.log('[Database] Connected to PostgreSQL');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    await client.query(schema);
    console.log('[Database] Schema initialized successfully');
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Database] Connection pool closed');
  }
}
