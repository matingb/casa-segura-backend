import { pool } from '../config/db';

export class TipoRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT t.*,
             json_agg(
               jsonb_build_object(
                 'id', s.id,
                 'nombre', s.nombre,
                 'descuento_general', s.descuento_general,
                 'descuentos_sucursal', COALESCE((
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
                 ), '[]'::json)
               )
               ORDER BY s.nombre
             ) FILTER (WHERE s.id IS NOT NULL) AS subtipos,
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
               WHERE d.tipo_id = t.id
             ), '[]'::json) AS descuentos_sucursal
      FROM public.tipo t
      LEFT JOIN public.subtipo s ON s.tipo_id = t.id
      WHERE t.tenant_id = $1
      GROUP BY t.id
      ORDER BY t.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async create(tenantId: string, nombre: string) {
    const query = `
      INSERT INTO public.tipo (tenant_id, nombre)
      VALUES ($1, $2)
      RETURNING id, tenant_id, nombre, descuento_general, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [tenantId, nombre]);
    return rows[0];
  }

  async delete(tenantId: string, id: string) {
    const query = `
      DELETE FROM public.tipo
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, nombre
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }

  /**
   * Actualiza el descuento que aplica a todas las sucursales.
   * `null` deja la categoría sin descuento definido.
   */
  async updateDescuentoGeneral(tenantId: string, id: string, descuento: number | null) {
    const query = `
      UPDATE public.tipo
      SET descuento_general = $3, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, nombre, descuento_general
    `;
    const { rows } = await pool.query(query, [id, tenantId, descuento]);
    return rows[0] ?? null;
  }

  async existeEnTenant(tenantId: string, id: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM public.tipo WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [id, tenantId]
    );
    return rows.length > 0;
  }
}
