import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

export interface PedidoReposicionCrearData {
  producto_sucursal_id: string;
  proveedor_id: string;
  cantidad: number;
  origen?: string;
}

export interface PedidoReposicionFiltros {
  producto?: string;
  sucursal?: string;
  proveedor?: string;
  estado?: string;
  usuario?: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  producto: 'p.nombre',
  sucursal: 's.nombre',
  proveedor: 'pv.nombre',
  estado: 'pr.estado',
  usuario: 'u.nombre',
  cantidad: 'pr.cantidad',
  fecha: 'pr.fecha',
};

export class PedidoReposicionRepository {
  async findAll(tenantId: string, sucursalId?: string) {
    const params: unknown[] = [tenantId];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND ps.sucursal_id = $${params.length}`;
    }
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
      WHERE pr.tenant_id = $1 ${sucursalClause}
      ORDER BY pr.fecha DESC
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND ps.sucursal_id = $${params.length}`;
    }
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
       WHERE pr.tenant_id = $1 ${sucursalClause}
       ORDER BY pr.fecha DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }

  async findPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    sucursalId?: string,
    filtros?: PedidoReposicionFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    const params: unknown[] = [tenantId];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND ps.sucursal_id = $${params.length}`;
    }

    const filterClauses: string[] = [];
    if (filtros?.producto) {
      params.push(`%${filtros.producto}%`);
      filterClauses.push(`p.nombre ILIKE $${params.length}`);
    }
    if (filtros?.sucursal) {
      params.push(filtros.sucursal);
      filterClauses.push(`s.nombre = $${params.length}`);
    }
    if (filtros?.proveedor) {
      params.push(filtros.proveedor);
      filterClauses.push(`pv.nombre = $${params.length}`);
    }
    if (filtros?.estado) {
      params.push(filtros.estado);
      filterClauses.push(`pr.estado = $${params.length}`);
    }
    if (filtros?.usuario) {
      params.push(`%${filtros.usuario}%`);
      filterClauses.push(`u.nombre ILIKE $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'pr.fecha DESC');

    const countQuery = `
      SELECT COUNT(*) FROM public.pedido_reposicion pr
      JOIN public.producto_sucursal ps ON ps.id = pr.producto_sucursal_id
      JOIN public.producto           p ON p.id  = ps.producto_id
      JOIN public.sucursal           s ON s.id  = ps.sucursal_id
      JOIN public.usuario            u ON u.id  = pr.usuario_id
      JOIN public.proveedor         pv ON pv.id = pr.proveedor_id
      WHERE pr.tenant_id = $1 ${sucursalClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
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
      WHERE pr.tenant_id = $1 ${sucursalClause} ${filtersSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, dataParams),
    ]);

    return {
      items: dataResult.rows,
      total: Number(countResult.rows[0].count),
    };
  }

  async findValoresUnicos(tenantId: string, campo: string): Promise<string[]> {
    if (campo === 'producto') {
      const { rows } = await pool.query(
        `SELECT DISTINCT p.nombre AS valor
         FROM public.pedido_reposicion pr
         JOIN public.producto_sucursal ps ON ps.id = pr.producto_sucursal_id
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE pr.tenant_id = $1 AND p.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'sucursal') {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.nombre AS valor
         FROM public.pedido_reposicion pr
         JOIN public.producto_sucursal ps ON ps.id = pr.producto_sucursal_id
         JOIN public.sucursal s ON s.id = ps.sucursal_id
         WHERE pr.tenant_id = $1 AND s.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'proveedor') {
      const { rows } = await pool.query(
        `SELECT DISTINCT pv.nombre AS valor
         FROM public.pedido_reposicion pr
         JOIN public.proveedor pv ON pv.id = pr.proveedor_id
         WHERE pr.tenant_id = $1 AND pv.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'usuario') {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.nombre AS valor
         FROM public.pedido_reposicion pr
         JOIN public.usuario u ON u.id = pr.usuario_id
         WHERE pr.tenant_id = $1 AND u.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'estado') {
      const { rows } = await pool.query(
        `SELECT DISTINCT pr.estado AS valor
         FROM public.pedido_reposicion pr
         WHERE pr.tenant_id = $1 AND pr.estado IS NOT NULL AND pr.estado <> ''
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    return [];
  }

  async insert(tenantId: string, usuarioId: string, data: PedidoReposicionCrearData) {
    const { rows } = await pool.query(
      `INSERT INTO public.pedido_reposicion (tenant_id, producto_sucursal_id, usuario_id, proveedor_id, cantidad, origen)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, data.producto_sucursal_id, usuarioId, data.proveedor_id, data.cantidad, data.origen ?? 'manual']
    );
    return rows[0];
  }
}
