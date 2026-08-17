import { pool } from '../config/db';

export class SucursalRepository {
  async findAll(tenantId: string) {
    const query = 'SELECT * FROM public.sucursal WHERE tenant_id = $1 ORDER BY es_central DESC, nombre';
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findByUsuario(authId: string, tenantId: string) {
    const query = `
      SELECT s.id,
             s.nombre,
             s.direccion,
             s.es_central,
             s.valor_dolar,
             s.activo,
             us.id AS usuario_sucursal_id,
             us.id_rol,
             r.nombre AS rol_nombre
      FROM public.sucursal s
      JOIN public.usuario_sucursal us ON us.sucursal_id = s.id
      JOIN public.usuario u           ON u.id = us.usuario_id
      JOIN public.rol r               ON r.id = us.id_rol
      WHERE u.auth_id = $1
        AND s.tenant_id = $2
        AND s.activo = TRUE
      ORDER BY s.es_central DESC, s.nombre
    `;
    const { rows } = await pool.query(query, [authId, tenantId]);
    return rows;
  }
}

