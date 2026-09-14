import { pool } from '../config/db';

export class SubtipoRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT s.*, t.nombre AS tipo_nombre
      FROM public.subtipo s
      JOIN public.tipo t ON t.id = s.tipo_id
      WHERE t.tenant_id = $1
      ORDER BY t.nombre, s.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async create(tenantId: string, tipoId: string, nombre: string) {
    const query = `
      INSERT INTO public.subtipo (tipo_id, nombre)
      SELECT t.id, $3
      FROM public.tipo t
      WHERE t.id = $1 AND t.tenant_id = $2
      RETURNING id, tipo_id, nombre, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [tipoId, tenantId, nombre]);
    return rows[0] ?? null;
  }

  async delete(tenantId: string, id: string) {
    const query = `
      DELETE FROM public.subtipo s
      USING public.tipo t
      WHERE s.id = $1 AND s.tipo_id = t.id AND t.tenant_id = $2
      RETURNING s.id, s.nombre, s.tipo_id
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }
}
