import { PoolClient } from 'pg';
import { CatalogoError } from './errors';

const RANGO_INVALIDO = `Esta cotización produce precios fuera del rango admitido. Revisá los precios o el dólar.`;

/** Comprueba únicamente montos cuyo equivalente cambia con la cotización destino. */
export async function validarRangoCotizacion(
  client: PoolClient,
  tenantId: string,
  tasa: string,
  sucursalId?: string
): Promise<void> {
  const sucursal = sucursalId !== undefined;
  const consulta = sucursal
    ? `WITH montos AS (
         SELECT CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.moneda_precio_base ELSE ps.moneda_precio_venta END AS moneda,
                CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.precio_base ELSE ps.precio_venta_ars END AS ars,
                CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.precio_base_usd ELSE ps.precio_venta_usd END AS usd
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE p.tenant_id = $1 AND ps.sucursal_id = $3
           AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
         UNION ALL
         SELECT ps.moneda_costo_reposicion, ps.costo_reposicion, ps.costo_reposicion_usd
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE p.tenant_id = $1 AND ps.sucursal_id = $3
           AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
       )
       SELECT EXISTS (
         SELECT 1 FROM montos
         WHERE (moneda = 'USD' AND usd IS NOT NULL AND usd * $2::numeric >= 1000000000000)
            OR (moneda = 'ARS' AND ars IS NOT NULL AND ars / $2::numeric >= 10000000000)
       ) AS fuera_de_rango`
    : `WITH montos AS (
         SELECT p.moneda_precio_base AS moneda, p.precio_base AS ars, p.precio_base_usd AS usd
         FROM public.producto p
         WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
         UNION ALL
         SELECT p.moneda_costo_reposicion_base, p.costo_reposicion_base, p.costo_reposicion_base_usd
         FROM public.producto p
         WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
         UNION ALL
         SELECT CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.moneda_precio_base ELSE ps.moneda_precio_venta END,
                CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.precio_base ELSE ps.precio_venta_ars END,
                CASE WHEN ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL THEN p.precio_base_usd ELSE ps.precio_venta_usd END
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         JOIN public.sucursal s ON s.id = ps.sucursal_id AND s.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND s.valor_dolar IS NULL
           AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
         UNION ALL
         SELECT ps.moneda_costo_reposicion, ps.costo_reposicion, ps.costo_reposicion_usd
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         JOIN public.sucursal s ON s.id = ps.sucursal_id AND s.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND s.valor_dolar IS NULL
           AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
       )
       SELECT EXISTS (
         SELECT 1 FROM montos
         WHERE (moneda = 'USD' AND usd IS NOT NULL AND usd * $2::numeric >= 1000000000000)
            OR (moneda = 'ARS' AND ars IS NOT NULL AND ars / $2::numeric >= 10000000000)
       ) AS fuera_de_rango`;

  const { rows } = await client.query(consulta, sucursal ? [tenantId, tasa, sucursalId] : [tenantId, tasa]);
  if (rows[0]?.fuera_de_rango) {
    throw new CatalogoError(RANGO_INVALIDO, 'PRECIO_FUERA_DE_RANGO');
  }
}
