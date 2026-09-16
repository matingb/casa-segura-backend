import { Pool } from 'pg';

const connectionString = process.env.DB_URL;

if (!connectionString) {
  throw new Error('FATAL: Missing required DB_URL environment variable.');
}

/**
 * Docker Desktop can accept a PostgreSQL connection on IPv6 localhost (::1)
 * and immediately reset it, while the same local port is healthy on IPv4.
 * Keep the configured credentials/port intact and only select the working
 * loopback address for this Windows-local case.
 */
function normalizeLocalConnectionString(value: string): string {
  if (process.platform !== 'win32') return value;

  const url = new URL(value);
  if (url.hostname === 'localhost') {
    url.hostname = '127.0.0.1';
  }
  return url.toString();
}

export const pool = new Pool({
  connectionString: normalizeLocalConnectionString(connectionString),
});
