import { pool } from '../config/db';

/**
 * Obtiene el tenant_id del usuario autenticado buscando por su auth_id (Supabase UID).
 * Lanza un error si el usuario no existe en public.usuario.
 */
export async function getTenantIdByAuthId(authId: string): Promise<string> {
  const { rows } = await pool.query(
    'SELECT tenant_id FROM public.usuario WHERE auth_id = $1 LIMIT 1',
    [authId]
  );
  if (!rows[0]) {
    throw new Error(`No se encontró el usuario con auth_id: ${authId}`);
  }
  return rows[0].tenant_id as string;
}
