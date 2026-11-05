import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { CatalogoError } from '../utils/errors';
import { ContextoMonetario } from '../utils/moneda';

export class CotizacionRepository {
  async obtener(tenantId: string, client?: PoolClient): Promise<ContextoMonetario> {
    const { rows } = await (client ?? pool).query(
      `SELECT cotizacion_usd_ars::text, cotizacion_version::text,
              cotizacion_actualizada_at AS actualizada_at,
              'TENANT'::text AS origen, NULL::uuid AS sucursal_id, NULL::text AS sucursal_nombre,
              cotizacion_actualizada_por AS actualizada_por,
              (SELECT nombre FROM public.usuario WHERE id = cotizacion_actualizada_por) AS actualizada_por_nombre
       FROM public.tenant WHERE id = $1 ${client ? 'FOR SHARE' : ''}`, [tenantId]);
    if (!rows[0]) throw new CatalogoError('Empresa no encontrada.', 'TENANT_INVALIDO', 404);
    return rows[0];
  }

  /** Contexto efectivo de un PDV. El token depende del origen y de las versiones que lo afectan. */
  async obtenerPorSucursal(tenantId: string, sucursalId: string, client?: PoolClient): Promise<ContextoMonetario> {
    const { rows } = await (client ?? pool).query(
      `SELECT COALESCE(s.valor_dolar, t.cotizacion_usd_ars)::text AS cotizacion_usd_ars,
              encode(convert_to(
                t.id::text || '|' || s.id::text || '|' ||
                CASE WHEN s.valor_dolar IS NULL THEN 'TENANT' ELSE 'SUCURSAL' END || '|' ||
                s.valor_dolar_version::text || '|' ||
                CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_version::text ELSE '' END,
                'UTF8'), 'hex') AS cotizacion_version,
              CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_actualizada_at ELSE s.valor_dolar_actualizada_at END AS actualizada_at,
              CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_actualizada_por ELSE s.valor_dolar_actualizada_por END AS actualizada_por,
              (SELECT u.nombre FROM public.usuario u WHERE u.id =
                CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_actualizada_por ELSE s.valor_dolar_actualizada_por END
              ) AS actualizada_por_nombre,
              CASE WHEN s.valor_dolar IS NULL THEN 'TENANT' ELSE 'SUCURSAL' END AS origen,
              s.id AS sucursal_id, s.nombre AS sucursal_nombre
       FROM public.tenant t
       JOIN public.sucursal s ON s.tenant_id = t.id
       WHERE t.id = $1 AND s.id = $2
       ${client ? 'FOR SHARE OF t, s' : ''}`,
      [tenantId, sucursalId]);
    if (!rows[0]) throw new CatalogoError('La sucursal indicada no pertenece a esta empresa.', 'SUCURSAL_INVALIDA', 404);
    return rows[0];
  }

  async autorizacion(authId: string, tenantId: string) {
    const { rows } = await pool.query(
      `SELECT u.id, EXISTS (
        SELECT 1 FROM public.usuario_sucursal us
        JOIN public.sucursal s ON s.id = us.sucursal_id AND s.tenant_id = u.tenant_id AND s.activo = TRUE
        JOIN public.rol r ON r.id = us.id_rol AND r.tenant_id = u.tenant_id
        JOIN public.permiso_rol pr ON pr.id_rol = r.id
        JOIN public.permiso p ON p.id = pr.id_permiso AND p.nombre = 'cotizacion.actualizar'
        WHERE us.usuario_id = u.id AND us.activo = TRUE
      ) AS puede_actualizar FROM public.usuario u
      WHERE u.auth_id = $1 AND u.tenant_id = $2 AND u.activo = TRUE`, [authId, tenantId]);
    return rows[0] as { id: string; puede_actualizar: boolean } | undefined;
  }
}
