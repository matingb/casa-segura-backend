import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

const JOIN_QUERY = `
  SELECT ps.*,
         p.codigo          AS producto_codigo,
         p.nombre          AS producto_nombre,
         p.marca           AS producto_marca,
         p.modelo          AS producto_modelo,
         p.imagen_url      AS producto_imagen_url,
         p.subtipo_id      AS producto_subtipo_id,
         p.activo          AS producto_activo,
         p.precio_base     AS producto_precio_base,
         p.costo_reposicion_base AS producto_costo_reposicion_base,
         s.nombre          AS sucursal_nombre
  FROM public.producto_sucursal ps
  JOIN public.producto  p ON p.id = ps.producto_id
  JOIN public.sucursal  s ON s.id = ps.sucursal_id
`;

export interface ProductoSucursalFiltros {
  codigo?: string;
  nombre?: string;
  marca?: string;
  modelo?: string;
  subtipo?: string;
  sucursal?: string;
  estado?: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  codigo: 'p.codigo',
  nombre: 'p.nombre',
  marca: 'p.marca',
  modelo: 'p.modelo',
  subtipo: 'sub.nombre',
  sucursal: 's.nombre',
  estado: 'ps.habilitado',
  cantidadDisponible: 'ps.cantidad_disponible',
  cantidadReservada: 'ps.cantidad_reservada',
  stockMinimo: 'ps.stock_minimo',
};

export interface ProductoSucursalData {
  producto_id: string;
  sucursal_id: string;
  costo_reposicion?: number | null;
  precio_venta_ars?: number | null;
  precio_venta_usd?: number | null;
  iva?: number | null;
  margen_minimo?: number | null;
  stock_minimo?: number | null;
  habilitado?: boolean;
  /** Corrección manual de stock (solo vía update, no en el alta). */
  cantidad_disponible?: number;
  cantidad_reservada?: number;
}

export class ProductoSucursalRepository {
  async findAll(tenantId: string) {
    const query = `
      ${JOIN_QUERY}
      WHERE p.tenant_id = $1
      ORDER BY s.nombre, p.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalId?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.marca ILIKE $${idx} OR p.modelo ILIKE $${idx})`;
    }
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      const idx = params.length;
      sucursalClause = `AND ps.sucursal_id = $${idx}`;
    }
    const { rows } = await pool.query(
      `${JOIN_QUERY}
       WHERE p.tenant_id = $1 ${searchClause} ${sucursalClause}
       ORDER BY s.nombre, p.nombre
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }

  async findPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    sucursalId?: string,
    filtros?: ProductoSucursalFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    const params: unknown[] = [tenantId];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.marca ILIKE $${idx} OR p.modelo ILIKE $${idx})`;
    }
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      const idx = params.length;
      sucursalClause = `AND ps.sucursal_id = $${idx}`;
    }

    const filterClauses: string[] = [];
    if (filtros?.codigo) {
      params.push(`%${filtros.codigo}%`);
      filterClauses.push(`p.codigo ILIKE $${params.length}`);
    }
    if (filtros?.nombre) {
      params.push(`%${filtros.nombre}%`);
      filterClauses.push(`p.nombre ILIKE $${params.length}`);
    }
    if (filtros?.marca) {
      params.push(filtros.marca);
      filterClauses.push(`p.marca = $${params.length}`);
    }
    if (filtros?.modelo) {
      params.push(filtros.modelo);
      filterClauses.push(`p.modelo = $${params.length}`);
    }
    if (filtros?.subtipo) {
      params.push(filtros.subtipo);
      filterClauses.push(`sub.nombre = $${params.length}`);
    }
    if (filtros?.sucursal) {
      params.push(filtros.sucursal);
      filterClauses.push(`s.nombre = $${params.length}`);
    }
    if (filtros?.estado) {
      params.push(filtros.estado === 'Habilitado');
      filterClauses.push(`ps.habilitado = $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 's.nombre ASC, p.nombre ASC');

    const countQuery = `
      SELECT COUNT(*) FROM public.producto_sucursal ps
      JOIN public.producto p ON p.id = ps.producto_id
      JOIN public.sucursal s ON s.id = ps.sucursal_id
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      WHERE p.tenant_id = $1 ${searchClause} ${sucursalClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT ps.*,
             p.codigo          AS producto_codigo,
             p.nombre          AS producto_nombre,
             p.marca           AS producto_marca,
             p.modelo          AS producto_modelo,
             p.imagen_url      AS producto_imagen_url,
             p.subtipo_id      AS producto_subtipo_id,
             p.activo          AS producto_activo,
             p.precio_base     AS producto_precio_base,
             p.costo_reposicion_base AS producto_costo_reposicion_base,
             s.nombre          AS sucursal_nombre
      FROM public.producto_sucursal ps
      JOIN public.producto  p ON p.id = ps.producto_id
      JOIN public.sucursal  s ON s.id = ps.sucursal_id
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      WHERE p.tenant_id = $1 ${searchClause} ${sucursalClause} ${filtersSql}
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
    const columnasPermitidas: Record<string, string> = {
      codigo: 'p.codigo',
      nombre: 'p.nombre',
      marca: 'p.marca',
      modelo: 'p.modelo',
    };

    if (campo === 'subtipo') {
      const { rows } = await pool.query(
        `SELECT DISTINCT sub.nombre AS valor
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         JOIN public.subtipo sub ON sub.id = p.subtipo_id
         WHERE p.tenant_id = $1 AND sub.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'sucursal') {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.nombre AS valor
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         JOIN public.sucursal s ON s.id = ps.sucursal_id
         WHERE p.tenant_id = $1 AND s.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'estado') {
      return ['Habilitado', 'Deshabilitado'];
    }

    const columna = columnasPermitidas[campo];
    if (!columna) return [];

    const { rows } = await pool.query(
      `SELECT DISTINCT ${columna} AS valor
       FROM public.producto_sucursal ps
       JOIN public.producto p ON p.id = ps.producto_id
       WHERE p.tenant_id = $1 AND ${columna} IS NOT NULL AND ${columna} <> ''
       ORDER BY valor`,
      [tenantId]
    );
    return rows.map((r) => r.valor);
  }

  async findById(id: string, tenantId: string) {
    const query = `
      ${JOIN_QUERY}
      WHERE ps.id = $1 AND p.tenant_id = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }

  async create(data: ProductoSucursalData, tenantId: string) {
    const { rows } = await pool.query(
      `INSERT INTO public.producto_sucursal
        (producto_id, sucursal_id, costo_reposicion, precio_venta_ars, precio_venta_usd, iva, margen_minimo, stock_minimo, habilitado)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       FROM public.producto p
       JOIN public.sucursal s ON s.id = $2 AND s.tenant_id = p.tenant_id
       WHERE p.id = $1 AND p.tenant_id = $10
       RETURNING *`,
      [
        data.producto_id,
        data.sucursal_id,
        data.costo_reposicion ?? null,
        data.precio_venta_ars ?? null,
        data.precio_venta_usd ?? null,
        data.iva ?? 21,
        data.margen_minimo ?? null,
        data.stock_minimo ?? 0,
        data.habilitado ?? true,
        tenantId,
      ]
    );
    return rows[0];
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string) {
    const fields = [
      'costo_reposicion',
      'precio_venta_ars',
      'precio_venta_usd',
      'iva',
      'margen_minimo',
      'stock_minimo',
      'habilitado',
      'cantidad_disponible',
      'cantidad_reservada',
    ];

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields) {
      if (field in data) {
        updates.push(`${field} = $${idx++}`);
        values.push((data as Record<string, unknown>)[field]);
      }
    }

    if (updates.length === 0) return null;

    values.push(id, tenantId);

    const { rows } = await pool.query(
      `UPDATE public.producto_sucursal ps
       SET ${updates.join(', ')}
       FROM public.producto p
       WHERE ps.id = $${idx++}
         AND ps.producto_id = p.id
         AND p.tenant_id = $${idx}
       RETURNING ps.*`,
      values
    );
    return rows[0] ?? null;
  }
}
