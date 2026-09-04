import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

export interface ProductoFiltros {
  codigo?: string;
  nombre?: string;
  marca?: string;
  modelo?: string;
  subtipo?: string;
  estado?: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  codigo: 'p.codigo',
  nombre: 'p.nombre',
  marca: 'p.marca',
  modelo: 'p.modelo',
  subtipo: 'sub.nombre',
  precioBase: 'p.precio_base',
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
  precio_base?: number | null;
  costo_reposicion_base?: number | null;
  codigo_qr?: string | null;
}

export class ProductoRepository {

  async findAll(tenantId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM public.producto WHERE tenant_id = $1 ORDER BY nombre',
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
      `SELECT p.* FROM public.producto p
       LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
       WHERE p.tenant_id = $1 ${searchClause}
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
    if (filtros?.estado) {
      params.push(filtros.estado === 'Activo');
      filterClauses.push(`p.activo = $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'p.nombre ASC');

    const countQuery = `
      SELECT COUNT(*) FROM public.producto p
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      WHERE p.tenant_id = $1 ${searchClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT p.* FROM public.producto p
      LEFT JOIN public.subtipo sub ON sub.id = p.subtipo_id
      WHERE p.tenant_id = $1 ${searchClause} ${filtersSql}
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
         FROM public.producto p
         JOIN public.subtipo sub ON sub.id = p.subtipo_id
         WHERE p.tenant_id = $1 AND sub.nombre IS NOT NULL
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
       WHERE p.tenant_id = $1 AND ${columna} IS NOT NULL AND ${columna} <> ''
       ORDER BY valor`,
      [tenantId]
    );
    return rows.map((r) => r.valor);
  }

  async findById(id: string, tenantId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM public.producto WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  async create(data: ProductoData) {
    const { rows } = await pool.query(
      `INSERT INTO public.producto
        (tenant_id, subtipo_id, codigo, codigo_barra_proveedor, nombre, marca, modelo,
         color, presentacion, alto, unidad_alto, ancho, unidad_ancho, profundidad, unidad_profundidad,
         peso_unitario, unidad_peso_unitario, imagen_url, descripcion, activo,
         precio_base, costo_reposicion_base, codigo_qr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
        data.codigo_qr ?? null,
      ]
    );
    return rows[0];
  }

  async update(id: string, data: Partial<ProductoData>, tenantId: string) {
    const fields = [
      'subtipo_id', 'codigo', 'codigo_barra_proveedor', 'nombre', 'marca',
      'modelo', 'color', 'presentacion',
      'alto', 'unidad_alto', 'ancho', 'unidad_ancho', 'profundidad', 'unidad_profundidad',
      'peso_unitario', 'unidad_peso_unitario',
      'imagen_url', 'descripcion', 'activo',
      'precio_base', 'costo_reposicion_base', 'codigo_qr',
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

    const { rows } = await pool.query(
      `UPDATE public.producto
       SET ${updates.join(', ')}
       WHERE id = $${idx++} AND tenant_id = $${idx}
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
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [publicUrl, id, tenantId]
    );
    return rows[0] ?? null;
  }
}
