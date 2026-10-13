import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';

// Crea una base nueva; nunca resetea public ni modifica otra aplicación local.
const source = new URL(process.env.DB_URL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)) throw new Error('La preparación de pruebas requiere PostgreSQL local.');
const database = process.env.CAS54_TEST_DATABASE ?? 'casa_segura_cas54_test';
if (!/^casa_segura_cas54_[a-z0-9_]+$/.test(database)) throw new Error('Nombre de base de prueba no permitido.');
const admin = new Pool({ connectionString: source.toString() });
try {
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (existing.rowCount) throw new Error(`La base ${database} ya existe; usá otro CAS54_TEST_DATABASE para una prueba desde cero.`);
  await admin.query(`CREATE DATABASE "${database}"`);
} finally { await admin.end(); }
source.pathname = `/${database}`;
const target = new Pool({ connectionString: source.toString() });
try {
  await target.query(`CREATE SCHEMA auth; CREATE TABLE auth.users (id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects (id UUID PRIMARY KEY, bucket_id TEXT);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    INSERT INTO auth.users (id) VALUES
      ('00000000-0000-0000-0000-00000000000a'),
      ('00000000-0000-0000-0000-00000000000b'),
      ('00000000-0000-0000-0000-00000000000c');`);
  const migrations = (await readdir('supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrations.filter((name) => !name.includes('cas54_'))) {
    await target.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  const seed = (await readFile('supabase/seed.sql', 'utf8'))
    .replace(/INSERT INTO auth\.users\s*\([\s\S]*?;\s*/g, '')
    .replace(/INSERT INTO auth\.identities\s*\([\s\S]*?;\s*/g, '');
  await target.query(seed);
  for (const file of migrations.filter((name) => name.includes('cas54_'))) {
    await target.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  const { rows } = await target.query('SELECT count(*)::int AS productos FROM public.producto_catalogo');
  console.log(JSON.stringify({ database, ...rows[0], migration: 'CAS-54 aplicada', auth: 'fixtures, sin copiar usuarios reales' }));
} finally { await target.end(); }
