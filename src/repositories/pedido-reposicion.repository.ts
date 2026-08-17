import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

export class PedidoReposicionRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT pr.*,
             p.nombre    AS producto_nombre,
             p.codigo    AS producto_codigo,
             s.nombre    AS sucursal_nombre,
             u.nombre    AS usuario_nombre,
             pv.nombre   AS proveedor_nombre
      FROM public.pedido_reposicion pr
      JOIN public.producto_sucursal ps ON ps.id = pr.producto_sucursal_id
      JOIN public.producto           p ON p.id  = ps.producto_id
      JOIN public.sucursal           s ON s.id  = ps.sucursal_id
      JOIN public.usuario            u ON u.id  = pr.usuario_id
      JOIN public.proveedor         pv ON pv.id = pr.proveedor_id
      WHERE pr.tenant_id = $1
      ORDER BY pr.fecha DESC
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number) {
    const sentinel = getLimitSentinel(limit);
    const { rows } = await pool.query(
      `SELECT pr.*,
              p.nombre    AS producto_nombre,
              p.codigo    AS producto_codigo,
              s.nombre    AS sucursal_nombre,
              u.nombre    AS usuario_nombre,
              pv.nombre   AS proveedor_nombre
       FROM public.pedido_reposicion pr
       JOIN public.producto_sucursal ps ON ps.id = pr.producto_sucursal_id
       JOIN public.producto           p ON p.id  = ps.producto_id
       JOIN public.sucursal           s ON s.id  = ps.sucursal_id
       JOIN public.usuario            u ON u.id  = pr.usuario_id
       JOIN public.proveedor         pv ON pv.id = pr.proveedor_id
       WHERE pr.tenant_id = $1
       ORDER BY pr.fecha DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, sentinel, offset]
    );
    return sliceWithHasMore(rows, limit);
  }
}
