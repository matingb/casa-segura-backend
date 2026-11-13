import { pool } from '../config/db';
import { PoolClient } from 'pg';
import { PrecioInput, Moneda } from '../utils/moneda';
import { withTransaction } from '../utils/db-transaction';
import { BusinessError, CatalogoError } from '../utils/errors';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

export interface ProductoFiltros {
  codigo?: string;
  nombre?: string;
  marca?: string;
  modelo?: string;
  tipo?: string;
  subtipo?: string;
  estado?: string;
  operativo?: boolean;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  codigo: 'p.codigo',
  nombre: 'p.nombre',
  marca: 'p.marca',
  modelo: 'p.modelo',
  subtipo: 'sub.nombre',
  costoReposicionBase: 'p.costo_reposicion_base_ars_resuelto',
  precioBase: 'p.precio_base_ars_resuelto',
  precioBaseArs: 'p.precio_base_ars_resuelto',
  precioBaseUsd: 'p.precio_base_usd_resuelto',
  estado: 'p.activo',
};

export type UnidadDimension = 'mm' | 'cm' | 'm';
export type UnidadPeso = 'g' | 'kg';

export interface ProductoData {
  tenant_id: string;
  subtipo_id?: string | null;
  codigo: string;
  codigo_barra_proveedor?: string | null;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  presentacion?: string | null;
  alto?: number | null;
  unidad_alto?: UnidadDimension;
  ancho?: number | null;
  unidad_ancho?: UnidadDimension;
  profundidad?: number | null;
  unidad_profundidad?: UnidadDimension;
  peso_unitario?: number | null;
  unidad_peso_unitario?: UnidadPeso;
  imagen_url?: string | null;
  descripcion?: string | null;
  activo?: boolean;
  precio?: PrecioInput | null;
  precio_base?: number | string | null;
  precio_base_usd?: string | null;
  moneda_precio_base?: Moneda;
  costo?: PrecioInput | null;
  costo_reposicion_base?: number | string | null;
  costo_reposicion_base_usd?: string | null;
  moneda_costo_reposicion_base?: Moneda;
  /** Descuento del producto para todas las sucursales (nivel 3 de la cascada). */
  descuento_base?: number | null;
  codigo_qr?: string | null;
}

export class ProductoRepository {

  async findAll(tenantId: string, operativo = false) {
    const { rows } = await pool.query(
      `SELECT * FROM public.producto_catalogo
       WHERE tenant_id = $1 AND deleted_at IS NULL ${operativo ? 'AND activo = TRUE' : ''}
       ORDER BY nombre`,
      [tenantId]
    );
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, search?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.marca ILIKE $${idx} OR p.modelo ILIKE $${idx} OR sub.nombre ILIKE $${idx})`;
    }
    const { rows } = await pool.query(
      `SELECT p.* FROM public.producto_catalogo p
       LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL ${searchClause}
       ORDER BY p.nombre
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
    filtros?: ProductoFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    const params: unknown[] = [tenantId];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (p.nombre ILIKE $${idx} OR p.codigo ILIKE $${idx} OR p.marca ILIKE $${idx} OR p.modelo ILIKE $${idx} OR sub.nombre ILIKE $${idx})`;
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
    if (filtros?.tipo) {
      params.push(filtros.tipo);
      filterClauses.push(`cat.nombre = $${params.length}`);
    }
    if (filtros?.estado) {
      params.push(filtros.estado === 'Activo');
      filterClauses.push(`p.activo = $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'p.nombre ASC')
      .split(', ').map((orden) => `${orden} NULLS LAST`).join(', ') + ', p.id ASC';

    const countQuery = `
      SELECT COUNT(*) FROM public.producto p
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      LEFT JOIN public.tipo cat ON cat.id = sub.tipo_id AND cat.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL ${searchClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT p.* FROM public.producto_catalogo p
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      LEFT JOIN public.tipo cat ON cat.id = sub.tipo_id AND cat.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.deleted_at IS NULL ${searchClause} ${filtersSql}
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

    if (campo === 'subtipo' || campo === 'tipo') {
      const columna = campo === 'tipo' ? 'cat.nombre' : 'sub.nombre';
      const { rows } = await pool.query(
        `SELECT DISTINCT ${columna} AS valor
         FROM public.producto p
         JOIN public.subtipo sub ON sub.id = p.subtipo_id
         LEFT JOIN public.tipo cat ON cat.id = sub.tipo_id AND cat.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND ${columna} IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'estado') {
      return ['Activo', 'Inactivo'];
    }

    const columna = columnasPermitidas[campo];
    if (!columna) return [];

    const { rows } = await pool.query(
      `SELECT DISTINCT ${columna} AS valor
       FROM public.producto p
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND ${columna} IS NOT NULL AND ${columna} <> ''
       ORDER BY valor`,
      [tenantId]
    );
    return rows.map((r) => r.valor);
  }

  async findById(id: string, tenantId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM public.producto_catalogo WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1',
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  async findSucursales(id: string, tenantId: string, sucursalIds: string[], client?: PoolClient) {
    const { rows } = await (client ?? pool).query(
      `SELECT s.id, s.nombre
       FROM public.producto_sucursal ps
       JOIN public.sucursal s ON s.id = ps.sucursal_id AND s.tenant_id = $2
       WHERE ps.producto_id = $1 AND ps.deleted_at IS NULL AND s.id = ANY($3::uuid[])
       ORDER BY s.nombre, s.id`,
      [id, tenantId, sucursalIds],
    );
    return rows;
  }

  async bloquearProducto(id: string, tenantId: string, client: PoolClient) {
    const result = await client.query(
      'SELECT id FROM public.producto WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [id, tenantId],
    );
    return Boolean(result.rowCount);
  }

  async create(data: ProductoData, client?: PoolClient) {
    const { rows } = await (client ?? pool).query(
      `INSERT INTO public.producto
        (tenant_id, subtipo_id, codigo, codigo_barra_proveedor, nombre, marca, modelo,
         color, presentacion, alto, unidad_alto, ancho, unidad_ancho, profundidad, unidad_profundidad,
         peso_unitario, unidad_peso_unitario, imagen_url, descripcion, activo,
         precio_base, costo_reposicion_base, descuento_base, codigo_qr, moneda_precio_base, precio_base_usd,
         moneda_costo_reposicion_base, costo_reposicion_base_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [
        data.tenant_id,
        data.subtipo_id ?? null,
        data.codigo,
        data.codigo_barra_proveedor ?? null,
        data.nombre,
        data.marca ?? null,
        data.modelo ?? null,
        data.color ?? null,
        data.presentacion ?? null,
        data.alto ?? null,
        data.unidad_alto ?? 'cm',
        data.ancho ?? null,
        data.unidad_ancho ?? 'cm',
        data.profundidad ?? null,
        data.unidad_profundidad ?? 'cm',
        data.peso_unitario ?? null,
        data.unidad_peso_unitario ?? 'kg',
        data.imagen_url ?? null,
        data.descripcion ?? null,
        data.activo ?? true,
        data.precio_base ?? null,
        data.costo_reposicion_base ?? null,
        data.descuento_base ?? null,
        data.codigo_qr ?? null,
        data.moneda_precio_base ?? 'ARS',
        data.precio_base_usd ?? null,
        data.moneda_costo_reposicion_base ?? 'ARS',
        data.costo_reposicion_base_usd ?? null,
      ]
    );
    return rows[0];
  }

  async asignarSucursales(productoId: string, sucursalIds: string[], tenantId: string, authId: string, client: PoolClient) {
    await this.validarAccesoSucursales(sucursalIds, tenantId, authId, client, true);
    await client.query(
      `INSERT INTO public.producto_sucursal (producto_id, sucursal_id, precio_referencia_confirmada)
       SELECT $1, sucursal_id, TRUE FROM unnest($2::uuid[]) AS seleccion(sucursal_id)
       ON CONFLICT (producto_id, sucursal_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
       WHERE producto_sucursal.deleted_at IS NOT NULL`,
      [productoId, sucursalIds],
    );
  }

  private async validarAccesoSucursales(sucursalIds: string[], tenantId: string, authId: string, client: PoolClient, soloActivas: boolean) {
    const { rows } = await client.query(
      `SELECT s.id
       FROM public.sucursal s
       JOIN public.usuario_sucursal us ON us.sucursal_id = s.id AND us.activo = TRUE
       JOIN public.usuario u ON u.id = us.usuario_id AND u.auth_id = $3 AND u.activo = TRUE
       WHERE s.id = ANY($1::uuid[]) AND s.tenant_id = $2 AND u.tenant_id = $2 AND (NOT $4::boolean OR s.activo)
       ORDER BY s.id
       FOR SHARE OF s, us, u`,
      [sucursalIds, tenantId, authId, soloActivas],
    );
    if (new Set(rows.map((row) => row.id)).size !== sucursalIds.length) {
      throw new CatalogoError('Una sucursal ya no está disponible. Revisá la selección.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
    }
  }

  async quitarSucursales(productoId: string, sucursalIds: string[], tenantId: string, authId: string, client: PoolClient) {
    await this.validarAccesoSucursales(sucursalIds, tenantId, authId, client, false);
    const { rows } = await client.query(
      `SELECT id, cantidad_disponible, cantidad_reservada
       FROM public.producto_sucursal
       WHERE producto_id = $1 AND sucursal_id = ANY($2::uuid[]) AND deleted_at IS NULL
       ORDER BY sucursal_id FOR UPDATE`,
      [productoId, sucursalIds],
    );
    if (rows.some(row => Number(row.cantidad_disponible) !== 0 || Number(row.cantidad_reservada) !== 0)) {
      throw new BusinessError('No se puede quitar una sucursal con stock disponible o reservado.');
    }
    await client.query(
      'UPDATE public.producto_sucursal SET deleted_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[])',
      [rows.map(row => row.id)],
    );
  }

  async update(id: string, data: Partial<ProductoData>, tenantId: string, client?: PoolClient) {
    const fields = [
      'subtipo_id', 'codigo', 'codigo_barra_proveedor', 'nombre', 'marca',
      'modelo', 'color', 'presentacion',
      'alto', 'unidad_alto', 'ancho', 'unidad_ancho', 'profundidad', 'unidad_profundidad',
      'peso_unitario', 'unidad_peso_unitario',
      'imagen_url', 'descripcion', 'activo',
      'precio_base', 'costo_reposicion_base', 'descuento_base', 'codigo_qr',
      'moneda_precio_base', 'precio_base_usd',
      'moneda_costo_reposicion_base', 'costo_reposicion_base_usd',
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

    updates.push(`updated_at = NOW()`);
    values.push(id, tenantId);

    const { rows } = await (client ?? pool).query(
      `UPDATE public.producto
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND tenant_id = $${idx} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return rows[0] ?? null;
  }

  async updateImagePath(
    id: string,
    publicUrl: string,
    tenantId: string
  ) {
    const { rows } = await pool.query(
      `UPDATE public.producto
       SET imagen_url = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [publicUrl, id, tenantId]
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string, tenantId: string) {
    return withTransaction(async (client) => {
      const { rows: productoRows } = await client.query(
        `SELECT id FROM public.producto
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [id, tenantId]
      );
      if (!productoRows[0]) return null;

      const { rows: stockRows } = await client.query(
        `SELECT id, cantidad_disponible, cantidad_reservada
         FROM public.producto_sucursal
         WHERE producto_id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      const conStock = stockRows.find((row) => Number(row.cantidad_disponible) !== 0 || Number(row.cantidad_reservada) !== 0);
      if (conStock) {
        throw new BusinessError('No se puede eliminar el producto porque tiene stock disponible o reservado.');
      }

      await client.query(
        `UPDATE public.producto_sucursal
         SET deleted_at = NOW()
         WHERE producto_id = $1 AND deleted_at IS NULL`,
        [id]
      );
      const { rows } = await client.query(
        `UPDATE public.producto
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [id, tenantId]
      );
      return rows[0];
    });
  }
}
