// Database connection utilities
import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

let pool: Pool | null = null;

export interface DatabaseConnection {
  query: (text: string, params?: any[]) => Promise<any>;
  getClient: () => Promise<PoolClient>;
  end: () => Promise<void>;
  healthCheck: () => Promise<boolean>;
  close: () => Promise<void>;
}

export async function initializeDatabase(connectionString?: string): Promise<DatabaseConnection> {
  if (pool) {
    return createDatabaseConnection(pool);
  }

  const dbUrl = connectionString || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!dbUrl) {
    logger.warn('No database connection string provided, database features will be disabled');
    // Return a mock connection for services that don't need database
    return {
      query: async () => ({ rows: [] }),
      getClient: async () => {
        throw new Error('Database not configured');
      },
      end: async () => {},
      healthCheck: async () => false,
      close: async () => {}
    };
  }

  pool = new Pool({
    connectionString: dbUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err: Error) => {
    logger.error('Unexpected database error', { error: err.message });
  });

  logger.info('Database connection pool initialized');

  return createDatabaseConnection(pool);
}

function createDatabaseConnection(pool: Pool): DatabaseConnection {
  return {
    query: async (text: string, params?: any[]) => {
      const start = Date.now();
      try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Executed query', { duration, rows: result.rowCount });
        return result.rows;
      } catch (error: any) {
        logger.error('Query error', { error: error.message, query: text });
        throw error;
      }
    },
    getClient: async () => {
      return await pool.connect();
    },
    end: async () => {
      if (pool) {
        await pool.end();
        (pool as any) = null;
        logger.info('Database connection pool closed');
      }
    },
    healthCheck: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch (error: any) {
        logger.error('Database health check failed', { error: error.message });
        return false;
      }
    },
    close: async () => {
      if (pool) {
        await pool.end();
        (pool as any) = null;
        logger.info('Database connection pool closed');
      }
    }
  };
}
