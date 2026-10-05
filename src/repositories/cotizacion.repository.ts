import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { CatalogoError } from '../utils/errors';
import { ContextoMonetario } from '../utils/moneda';

export class CotizacionRepository {
  async obtener(tenantId: string, client?: PoolClient): Promise<ContextoMonetario> {
    const { rows } = await (client ?? pool).query(
      `SELECT cotizacion_usd_ars::text, cotizacion_version::text,
              cotizacion_actualizada_at AS actualizada_at,
              cotizacion_actualizada_por AS actualizada_por,
              (SELECT nombre FROM public.usuario WHERE id = cotizacion_actualizada_por) AS actualizada_por_nombre
       FROM public.tenant WHERE id = $1 ${client ? 'FOR SHARE' : ''}`, [tenantId]);
    if (!rows[0]) throw new CatalogoError('Empresa no encontrada.', 'TENANT_INVALIDO', 404);
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
        WHERE us.usuario_id = u.id
      ) AS puede_actualizar FROM public.usuario u
      WHERE u.auth_id = $1 AND u.tenant_id = $2 AND u.activo = TRUE`, [authId, tenantId]);
    return rows[0] as { id: string; puede_actualizar: boolean } | undefined;
  }
}
