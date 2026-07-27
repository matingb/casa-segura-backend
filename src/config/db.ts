import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DB_URL;

if (!connectionString) {
  console.warn('Missing DB_URL environment variable.');
}

export const pool = new Pool({
  connectionString,
});
