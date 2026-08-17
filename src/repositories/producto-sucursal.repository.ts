import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

const JOIN_QUERY = `
  SELECT ps.*,
         p.codigo          AS producto_codigo,
         p.nombre          AS producto_nombre,
         p.marca           AS producto_marca,
         p.modelo          AS producto_modelo,
         p.imagen_url      AS producto_imagen_url,
         p.subtipo_id      AS producto_subtipo_id,
         p.activo          AS producto_activo,
         s.nombre          AS sucursal_nombre
  FROM public.producto_sucursal ps
  JOIN public.producto  p ON p.id = ps.producto_id
  JOIN public.sucursal  s ON s.id = ps.sucursal_id
`;

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

  async findById(id: string, tenantId: string) {
    const query = `
      ${JOIN_QUERY}
      WHERE ps.id = $1 AND p.tenant_id = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }

  async create(data: ProductoSucursalData) {
    const { rows } = await pool.query(
      `INSERT INTO public.producto_sucursal
        (producto_id, sucursal_id, costo_reposicion, precio_venta_ars, precio_venta_usd, iva, margen_minimo, stock_minimo, habilitado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
