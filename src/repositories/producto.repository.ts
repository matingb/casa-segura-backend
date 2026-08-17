import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

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
  ancho?: number | null;
  profundidad?: number | null;
  peso_unitario?: number | null;
  imagen_url?: string | null;
  descripcion?: string | null;
  activo?: boolean;
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
      searchClause = `AND (nombre ILIKE $${idx} OR codigo ILIKE $${idx} OR marca ILIKE $${idx} OR modelo ILIKE $${idx})`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM public.producto
       WHERE tenant_id = $1 ${searchClause}
       ORDER BY nombre
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
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
         color, presentacion, alto, ancho, profundidad, peso_unitario, imagen_url, descripcion, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
        data.ancho ?? null,
        data.profundidad ?? null,
        data.peso_unitario ?? null,
        data.imagen_url ?? null,
        data.descripcion ?? null,
        data.activo ?? true,
      ]
    );
    return rows[0];
  }

  async update(id: string, data: Partial<ProductoData>, tenantId: string) {
    const fields = [
      'subtipo_id', 'codigo', 'codigo_barra_proveedor', 'nombre', 'marca',
      'modelo', 'color', 'presentacion', 'alto', 'ancho', 'profundidad',
      'peso_unitario', 'imagen_url', 'descripcion', 'activo',
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
