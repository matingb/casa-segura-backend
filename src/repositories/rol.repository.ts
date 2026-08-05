import { pool } from '../config/db';

export class RolRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT r.*, 
             json_agg(DISTINCT jsonb_build_object('id', p.id, 'nombre', p.nombre)) 
               FILTER (WHERE p.id IS NOT NULL) AS permisos
      FROM public.rol r
      LEFT JOIN public.permiso_rol pr ON pr.id_rol = r.id
      LEFT JOIN public.permiso p ON p.id = pr.id_permiso
      WHERE r.tenant_id = $1
      GROUP BY r.id
      ORDER BY r.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }
}
