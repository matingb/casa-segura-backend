import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

export class OperacionRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT o.*,
             to2.nombre  AS tipo_nombre,
             u.nombre    AS usuario_nombre,
             s.nombre    AS sucursal_nombre
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      WHERE o.tenant_id = $1
      ORDER BY o.fecha DESC
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number) {
    const sentinel = getLimitSentinel(limit);
    const { rows } = await pool.query(
      `SELECT o.*,
              to2.nombre  AS tipo_nombre,
              u.nombre    AS usuario_nombre,
              s.nombre    AS sucursal_nombre
       FROM public.operacion o
       JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
       JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
       JOIN public.usuario           u  ON u.id   = us.usuario_id
       JOIN public.sucursal          s  ON s.id   = us.sucursal_id
       WHERE o.tenant_id = $1
       ORDER BY o.fecha DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, sentinel, offset]
    );
    return sliceWithHasMore(rows, limit);
  }
}
