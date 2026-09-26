import { pool } from '../config/db';

export type DestinoDescuento = { tipoId: string } | { subtipoId: string };

export class DescuentoCategoriaRepository {
  /**
   * Alta o actualización de la excepción de una sucursal. Se apoya en los
   * índices únicos parciales (tipo_id, sucursal_id) y (subtipo_id, sucursal_id),
   * así reasignar el mismo par no duplica filas.
   */
  async upsert(destino: DestinoDescuento, sucursalId: string, porcentaje: number) {
    const esTipo = 'tipoId' in destino;
    const conflictTarget = esTipo
      ? '(tipo_id, sucursal_id) WHERE tipo_id IS NOT NULL'
      : '(subtipo_id, sucursal_id) WHERE subtipo_id IS NOT NULL';

    const { rows } = await pool.query(
      `INSERT INTO public.descuento_categoria_sucursal (tipo_id, subtipo_id, sucursal_id, porcentaje)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET porcentaje = EXCLUDED.porcentaje, updated_at = NOW()
       RETURNING *`,
      [
        esTipo ? destino.tipoId : null,
        esTipo ? null : (destino as { subtipoId: string }).subtipoId,
        sucursalId,
        porcentaje,
      ]
    );
    return rows[0];
  }

  /**
   * Elimina la excepción por id, validando que pertenezca al tenant a través
   * de la categoría/subcategoría a la que apunta.
   */
  async delete(tenantId: string, id: string) {
    const { rows } = await pool.query(
      `DELETE FROM public.descuento_categoria_sucursal d
       WHERE d.id = $1
         AND (
           EXISTS (SELECT 1 FROM public.tipo t WHERE t.id = d.tipo_id AND t.tenant_id = $2)
           OR EXISTS (
             SELECT 1 FROM public.subtipo s
             JOIN public.tipo t ON t.id = s.tipo_id
             WHERE s.id = d.subtipo_id AND t.tenant_id = $2
           )
         )
       RETURNING d.id`,
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  async sucursalPerteneceAlTenant(sucursalId: string, tenantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM public.sucursal WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [sucursalId, tenantId]
    );
    return rows.length > 0;
  }
}
