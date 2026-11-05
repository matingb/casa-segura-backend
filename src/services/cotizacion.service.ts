import { pool } from '../config/db';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { CatalogoError } from '../utils/errors';
import { decimalValido } from '../utils/moneda';
import { validarRangoCotizacion } from '../utils/validacion-cotizacion';

export class CotizacionService {
  private repo = new CotizacionRepository();

  async obtener(tenantId: string, authId: string, sucursalId?: string) {
    const [contexto, usuario, sugerencias] = await Promise.all([
      sucursalId ? this.repo.obtenerPorSucursal(tenantId, sucursalId) : this.repo.obtener(tenantId),
      this.repo.autorizacion(authId, tenantId),
      pool.query('SELECT id, nombre, valor_dolar::text FROM public.sucursal WHERE tenant_id = $1 AND activo = TRUE ORDER BY nombre', [tenantId]),
    ]);
    return { ...contexto, puede_actualizar: usuario?.puede_actualizar ?? false, sugerencias_sucursales: sugerencias.rows };
  }

  async actualizar(tenantId: string, authId: string, valor: unknown, version: unknown) {
    const usuario = await this.repo.autorizacion(authId, tenantId);
    if (!usuario?.puede_actualizar) throw new CatalogoError('No tenés permiso para actualizar el valor del dólar.', 'SIN_PERMISO', 403);
    const tasa = decimalValido(valor, 'La cotización', 6, 12, true);
    if (typeof version !== 'string' || !/^\d+$/.test(version)) throw new CatalogoError('Indicá la versión de cotización que estás actualizando.', 'VERSION_INVALIDA');
    await withTransaction(async (client) => {
      const { rows: actuales } = await client.query('SELECT cotizacion_version::text FROM public.tenant WHERE id = $1 FOR UPDATE', [tenantId]);
      if (!actuales[0] || actuales[0].cotizacion_version !== version) throw new CatalogoError('El dólar fue actualizado por otra persona. Recargá la referencia antes de guardar.', 'COTIZACION_CAMBIO', 409);
      await validarRangoCotizacion(client, tenantId, tasa.toFixed(6));
      await client.query(`UPDATE public.tenant SET cotizacion_usd_ars = $1,
        cotizacion_actualizada_at = NOW(), cotizacion_actualizada_por = $2,
        cotizacion_version = cotizacion_version + 1 WHERE id = $3`, [tasa.toFixed(6), usuario.id, tenantId]);
    });
    return this.obtener(tenantId, authId);
  }
}
