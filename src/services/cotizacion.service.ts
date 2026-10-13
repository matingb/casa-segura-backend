import { pool } from '../config/db';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { CatalogoError } from '../utils/errors';
import { decimalValido, Dinero } from '../utils/moneda';

export class CotizacionService {
  private repo = new CotizacionRepository();

  async obtener(tenantId: string, authId: string) {
    const [contexto, usuario, sugerencias] = await Promise.all([
      this.repo.obtener(tenantId), this.repo.autorizacion(authId, tenantId),
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
      const { rows } = await client.query(`SELECT max(ars) AS ars, max(usd) AS usd FROM (
        SELECT CASE WHEN moneda_precio_base = 'ARS' THEN precio_base END AS ars,
               CASE WHEN moneda_precio_base = 'USD' THEN precio_base_usd END AS usd
        FROM public.producto WHERE tenant_id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT CASE WHEN ps.moneda_precio_venta = 'ARS' THEN ps.precio_venta_ars END,
               CASE WHEN ps.moneda_precio_venta = 'USD' THEN ps.precio_venta_usd END
        FROM public.producto_sucursal ps JOIN public.producto p ON p.id = ps.producto_id
        WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
      ) precios`, [tenantId]);
      if ((rows[0]?.usd != null && new Dinero(rows[0].usd).mul(tasa).gte('1000000000000')) ||
          (rows[0]?.ars != null && new Dinero(rows[0].ars).div(tasa).gte('10000000000'))) {
        throw new CatalogoError('Esta cotización produce precios fuera del rango admitido. Revisá los precios o el dólar.', 'PRECIO_FUERA_DE_RANGO');
      }
      await client.query(`UPDATE public.tenant SET cotizacion_usd_ars = $1,
        cotizacion_actualizada_at = NOW(), cotizacion_actualizada_por = $2,
        cotizacion_version = cotizacion_version + 1 WHERE id = $3`, [tasa.toFixed(6), usuario.id, tenantId]);
    });
    return this.obtener(tenantId, authId);
  }
}
