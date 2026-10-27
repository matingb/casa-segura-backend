-- Precio del stock con el precio base del producto por defecto.
--
-- Un stock sin precio propio (sin principal ARS ni USD) usa el precio base del
-- producto, con su moneda de referencia. No se copia: si cambia el precio del
-- producto, el stock lo sigue hasta que se le cargue uno propio.
--
-- La vista expone el precio efectivo en columnas nuevas (`*_efectivo`,
-- `moneda_precio_efectiva`, `precio_desde_producto`) para que la lista de
-- precios y la evaluación de ventas lo lean del mismo lugar, y resuelve con él
-- `precio_venta_*_resuelto` y `precio_resuelto`. Las columnas propias del stock
-- (`ps.*`) no cambian.

DROP VIEW public.producto_sucursal_catalogo;

CREATE VIEW public.producto_sucursal_catalogo WITH (security_invoker = true) AS
SELECT ps.*,
  CASE WHEN e.moneda = 'USD' THEN round(e.usd * t.cotizacion_usd_ars, 2)
       ELSE e.ars END AS precio_venta_ars_resuelto,
  CASE WHEN e.moneda = 'USD' THEN e.usd
       WHEN t.cotizacion_usd_ars > 0 THEN round(e.ars / t.cotizacion_usd_ars, 4)
       ELSE NULL END AS precio_venta_usd_resuelto,
  public.catalogo_resolver_precio(e.moneda, e.ars, e.usd, t.cotizacion_usd_ars, e.confirmado) AS precio_resuelto,
  jsonb_build_object('cotizacion_usd_ars', t.cotizacion_usd_ars::text,
    'cotizacion_version', t.cotizacion_version::text,
    'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario,
  CASE WHEN ps.moneda_costo_reposicion = 'USD' THEN round(ps.costo_reposicion_usd * t.cotizacion_usd_ars, 2)
       ELSE ps.costo_reposicion END AS costo_reposicion_ars_resuelto,
  public.catalogo_resolver_precio(ps.moneda_costo_reposicion, ps.costo_reposicion,
    ps.costo_reposicion_usd, t.cotizacion_usd_ars) AS costo_reposicion_resuelto,
  e.desde_producto AS precio_desde_producto,
  e.moneda AS moneda_precio_efectiva,
  e.ars AS precio_efectivo_ars,
  e.usd AS precio_efectivo_usd,
  e.confirmado AS precio_efectivo_confirmado
FROM public.producto_sucursal ps
JOIN public.producto p ON p.id = ps.producto_id
JOIN public.tenant t ON t.id = p.tenant_id
CROSS JOIN LATERAL (
  SELECT d.desde_producto,
         CASE WHEN d.desde_producto THEN p.moneda_precio_base ELSE ps.moneda_precio_venta END AS moneda,
         CASE WHEN d.desde_producto THEN p.precio_base ELSE ps.precio_venta_ars END AS ars,
         CASE WHEN d.desde_producto THEN p.precio_base_usd ELSE ps.precio_venta_usd END AS usd,
         CASE WHEN d.desde_producto THEN TRUE ELSE ps.precio_referencia_confirmada END AS confirmado
  FROM (SELECT ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL AS desde_producto) d
) e;

COMMENT ON VIEW public.producto_sucursal_catalogo IS
  'Stock con montos resueltos a la cotización vigente. Sin precio propio, el precio es el base del producto (precio_desde_producto).';

REVOKE ALL ON public.producto_sucursal_catalogo FROM anon, authenticated;
GRANT SELECT ON public.producto_sucursal_catalogo TO authenticated, service_role;
