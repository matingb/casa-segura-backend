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
}
