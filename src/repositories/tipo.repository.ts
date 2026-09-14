import { pool } from '../config/db';

export class TipoRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT t.*,
             json_agg(
               jsonb_build_object('id', s.id, 'nombre', s.nombre)
               ORDER BY s.nombre
             ) FILTER (WHERE s.id IS NOT NULL) AS subtipos
      FROM public.tipo t
      LEFT JOIN public.subtipo s ON s.tipo_id = t.id
      WHERE t.tenant_id = $1
      GROUP BY t.id
      ORDER BY t.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async create(tenantId: string, nombre: string) {
    const query = `
      INSERT INTO public.tipo (tenant_id, nombre)
      VALUES ($1, $2)
      RETURNING id, tenant_id, nombre, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [tenantId, nombre]);
    return rows[0];
  }

  async delete(tenantId: string, id: string) {
    const query = `
      DELETE FROM public.tipo
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, nombre
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }
}
