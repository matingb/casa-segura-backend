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
}
