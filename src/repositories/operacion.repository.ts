import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

export class OperacionRepository {
  async findAll(tenantId: string, sucursalId?: string, tipoId?: string) {
    const params: unknown[] = [tenantId];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND us.sucursal_id = $${params.length}`;
    }
    let tipoClause = '';
    if (tipoId) {
      params.push(tipoId);
      tipoClause = `AND o.tipo_id = $${params.length}`;
    }
    const query = `
      SELECT o.*,
             to2.nombre     AS tipo_nombre,
             u.nombre       AS usuario_nombre,
             s.nombre       AS sucursal_nombre,
             us.sucursal_id AS sucursal_id
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause}
      ORDER BY o.fecha DESC
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string, tipoId?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND us.sucursal_id = $${params.length}`;
    }
    let tipoClause = '';
    if (tipoId) {
      params.push(tipoId);
      tipoClause = `AND o.tipo_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT o.*,
              to2.nombre     AS tipo_nombre,
              u.nombre       AS usuario_nombre,
              s.nombre       AS sucursal_nombre,
              us.sucursal_id AS sucursal_id
       FROM public.operacion o
       JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
       JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
       JOIN public.usuario           u  ON u.id   = us.usuario_id
       JOIN public.sucursal          s  ON s.id   = us.sucursal_id
       WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause}
       ORDER BY o.fecha DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }
}
