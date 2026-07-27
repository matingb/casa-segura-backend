import { Pool } from 'pg';

const connectionString = process.env.DB_URL;

if (!connectionString) {
  throw new Error('FATAL: Missing required DB_URL environment variable.');
}

export const pool = new Pool({ connectionString });
