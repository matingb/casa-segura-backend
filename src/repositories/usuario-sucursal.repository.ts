import { pool } from '../config/db';

export class UsuarioSucursalRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT us.*,
             u.nombre   AS usuario_nombre,
             u.email    AS usuario_email,
             s.nombre   AS sucursal_nombre,
             r.nombre   AS rol_nombre
      FROM public.usuario_sucursal us
      JOIN public.usuario  u ON u.id = us.usuario_id
      JOIN public.sucursal s ON s.id = us.sucursal_id
      JOIN public.rol      r ON r.id = us.id_rol
      WHERE u.tenant_id = $1
      ORDER BY s.nombre, u.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }
}
