import { pool } from '../config/db';

export class SubtipoRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT s.*,
             t.nombre AS tipo_nombre,
             COALESCE((
               SELECT json_agg(
                        jsonb_build_object(
                          'id', d.id,
                          'sucursal_id', d.sucursal_id,
                          'sucursal_nombre', suc.nombre,
                          'porcentaje', d.porcentaje
                        ) ORDER BY suc.nombre
                      )
               FROM public.descuento_categoria_sucursal d
               JOIN public.sucursal suc ON suc.id = d.sucursal_id
               WHERE d.subtipo_id = s.id
             ), '[]'::json) AS descuentos_sucursal
      FROM public.subtipo s
      JOIN public.tipo t ON t.id = s.tipo_id
      WHERE t.tenant_id = $1
      ORDER BY t.nombre, s.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async create(tenantId: string, tipoId: string, nombre: string) {
    const query = `
      INSERT INTO public.subtipo (tipo_id, nombre)
      SELECT t.id, $3
      FROM public.tipo t
      WHERE t.id = $1 AND t.tenant_id = $2
      RETURNING id, tipo_id, nombre, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [tipoId, tenantId, nombre]);
    return rows[0] ?? null;
  }

  async delete(tenantId: string, id: string) {
    const query = `
      DELETE FROM public.subtipo s
      USING public.tipo t
      WHERE s.id = $1 AND s.tipo_id = t.id AND t.tenant_id = $2
      RETURNING s.id, s.nombre, s.tipo_id
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }

  /**
   * Actualiza el descuento que aplica a todas las sucursales.
   * `null` deja la subcategoría sin descuento propio: hereda el de su categoría.
   */
  async updateDescuentoGeneral(tenantId: string, id: string, descuento: number | null) {
    const query = `
      UPDATE public.subtipo s
      SET descuento_general = $3, updated_at = NOW()
      FROM public.tipo t
      WHERE s.id = $1 AND s.tipo_id = t.id AND t.tenant_id = $2
      RETURNING s.id, s.nombre, s.descuento_general
    `;
    const { rows } = await pool.query(query, [id, tenantId, descuento]);
    return rows[0] ?? null;
  }

  async existeEnTenant(tenantId: string, id: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT 1 FROM public.subtipo s
       JOIN public.tipo t ON t.id = s.tipo_id
       WHERE s.id = $1 AND t.tenant_id = $2 LIMIT 1`,
      [id, tenantId]
    );
    return rows.length > 0;
  }
}
