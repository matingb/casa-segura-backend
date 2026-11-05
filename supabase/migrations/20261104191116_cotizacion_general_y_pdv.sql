-- Cotización general de empresa con excepción opcional por PDV.
-- No se convierten importes principales ni operaciones históricas.

-- Diagnóstico explícito: no reinterpretar ni corregir tasas heredadas inválidas.
DO $$
DECLARE
  invalidos TEXT;
BEGIN
  SELECT string_agg(format('%s=%s', id, valor_dolar::text), ', ' ORDER BY id)
    INTO invalidos
  FROM public.sucursal
  WHERE valor_dolar IS NOT NULL
    AND (valor_dolar <= 0 OR valor_dolar >= 'Infinity'::numeric OR valor_dolar = 'NaN'::numeric);

  IF invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay cotizaciones propias de sucursal que requieren revisión antes de migrar: %', invalidos;
  END IF;
END;
$$;

ALTER TABLE public.sucursal
  ALTER COLUMN valor_dolar TYPE NUMERIC(18,6) USING valor_dolar::NUMERIC(18,6),
  ADD COLUMN valor_dolar_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN valor_dolar_actualizada_at TIMESTAMPTZ,
  ADD COLUMN valor_dolar_actualizada_por UUID REFERENCES public.usuario(id) ON DELETE SET NULL,
  ADD CONSTRAINT sucursal_valor_dolar_valida CHECK (
    valor_dolar IS NULL OR
    (valor_dolar > 0 AND valor_dolar < 'Infinity'::numeric AND valor_dolar <> 'NaN'::numeric)
  );

COMMENT ON COLUMN public.sucursal.valor_dolar IS
  'Cotización propia opcional del PDV. NULL hereda tenant.cotizacion_usd_ars.';
COMMENT ON COLUMN public.sucursal.valor_dolar_version IS
  'Versión para concurrencia de la cotización propia; cambia al establecerla, modificarla o quitarla.';

-- El cliente autenticado no puede eludir el contrato versionado del backend.
-- Se mantienen los campos no monetarios que podría actualizar directamente.
REVOKE UPDATE ON public.sucursal FROM authenticated;
REVOKE UPDATE (valor_dolar, valor_dolar_version, valor_dolar_actualizada_at, valor_dolar_actualizada_por)
  ON public.sucursal FROM authenticated;
GRANT UPDATE (nombre, es_central, descuento, activo, updated_at) ON public.sucursal TO authenticated;
REVOKE INSERT ON public.sucursal FROM authenticated;
REVOKE INSERT (valor_dolar, valor_dolar_version, valor_dolar_actualizada_at, valor_dolar_actualizada_por)
  ON public.sucursal FROM authenticated;
GRANT INSERT (tenant_id, nombre, es_central, descuento, activo) ON public.sucursal TO authenticated;

DROP VIEW public.producto_sucursal_catalogo;
DROP VIEW public.producto_catalogo;

CREATE VIEW public.producto_catalogo WITH (security_invoker = true) AS
SELECT p.*,
  CASE WHEN p.moneda_precio_base = 'USD' THEN round(p.precio_base_usd * t.cotizacion_usd_ars, 2)
       ELSE p.precio_base END AS precio_base_ars_resuelto,
  CASE WHEN p.moneda_precio_base = 'USD' THEN p.precio_base_usd
       WHEN t.cotizacion_usd_ars > 0 THEN round(p.precio_base / t.cotizacion_usd_ars, 4)
       ELSE NULL END AS precio_base_usd_resuelto,
  public.catalogo_resolver_precio(p.moneda_precio_base, p.precio_base, p.precio_base_usd,
    t.cotizacion_usd_ars) AS precio_resuelto,
  jsonb_build_object(
    'cotizacion_usd_ars', t.cotizacion_usd_ars::text,
    'cotizacion_version', t.cotizacion_version::text,
    'actualizada_at', t.cotizacion_actualizada_at,
    'actualizada_por', t.cotizacion_actualizada_por,
    'actualizada_por_nombre', (SELECT u.nombre FROM public.usuario u WHERE u.id = t.cotizacion_actualizada_por),
    'origen', 'TENANT', 'sucursal_id', NULL, 'sucursal_nombre', NULL
  ) AS contexto_monetario,
  CASE WHEN p.moneda_costo_reposicion_base = 'USD' THEN round(p.costo_reposicion_base_usd * t.cotizacion_usd_ars, 2)
       ELSE p.costo_reposicion_base END AS costo_reposicion_base_ars_resuelto,
  public.catalogo_resolver_precio(p.moneda_costo_reposicion_base, p.costo_reposicion_base,
    p.costo_reposicion_base_usd, t.cotizacion_usd_ars) AS costo_reposicion_base_resuelto
FROM public.producto p
JOIN public.tenant t ON t.id = p.tenant_id;

CREATE VIEW public.producto_sucursal_catalogo WITH (security_invoker = true) AS
SELECT ps.*,
  CASE WHEN e.moneda = 'USD' THEN round(e.usd * c.tasa, 2)
       ELSE e.ars END AS precio_venta_ars_resuelto,
  CASE WHEN e.moneda = 'USD' THEN e.usd
       WHEN c.tasa > 0 THEN round(e.ars / c.tasa, 4)
       ELSE NULL END AS precio_venta_usd_resuelto,
  public.catalogo_resolver_precio(e.moneda, e.ars, e.usd, c.tasa, e.confirmado) AS precio_resuelto,
  jsonb_build_object(
    'cotizacion_usd_ars', c.tasa::text,
    'cotizacion_version', c.version,
    'actualizada_at', c.actualizada_at,
    'actualizada_por', c.actualizada_por,
    'actualizada_por_nombre', usuario.nombre,
    'origen', c.origen,
    'sucursal_id', s.id,
    'sucursal_nombre', s.nombre
  ) AS contexto_monetario,
  CASE WHEN ps.moneda_costo_reposicion = 'USD' THEN round(ps.costo_reposicion_usd * c.tasa, 2)
       ELSE ps.costo_reposicion END AS costo_reposicion_ars_resuelto,
  public.catalogo_resolver_precio(ps.moneda_costo_reposicion, ps.costo_reposicion,
    ps.costo_reposicion_usd, c.tasa) AS costo_reposicion_resuelto,
  e.desde_producto AS precio_desde_producto,
  e.moneda AS moneda_precio_efectiva,
  e.ars AS precio_efectivo_ars,
  e.usd AS precio_efectivo_usd,
  e.confirmado AS precio_efectivo_confirmado
FROM public.producto_sucursal ps
JOIN public.producto p ON p.id = ps.producto_id
JOIN public.tenant t ON t.id = p.tenant_id
JOIN public.sucursal s ON s.id = ps.sucursal_id AND s.tenant_id = p.tenant_id
CROSS JOIN LATERAL (
  SELECT COALESCE(s.valor_dolar, t.cotizacion_usd_ars) AS tasa,
    encode(convert_to(
      t.id::text || '|' || s.id::text || '|' ||
      CASE WHEN s.valor_dolar IS NULL THEN 'TENANT' ELSE 'SUCURSAL' END || '|' ||
      s.valor_dolar_version::text || '|' ||
      CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_version::text ELSE '' END,
      'UTF8'), 'hex') AS version,
    CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_actualizada_at ELSE s.valor_dolar_actualizada_at END AS actualizada_at,
    CASE WHEN s.valor_dolar IS NULL THEN t.cotizacion_actualizada_por ELSE s.valor_dolar_actualizada_por END AS actualizada_por,
    CASE WHEN s.valor_dolar IS NULL THEN 'TENANT' ELSE 'SUCURSAL' END AS origen
) c
LEFT JOIN public.usuario usuario ON usuario.id = c.actualizada_por
CROSS JOIN LATERAL (
  SELECT d.desde_producto,
         CASE WHEN d.desde_producto THEN p.moneda_precio_base ELSE ps.moneda_precio_venta END AS moneda,
         CASE WHEN d.desde_producto THEN p.precio_base ELSE ps.precio_venta_ars END AS ars,
         CASE WHEN d.desde_producto THEN p.precio_base_usd ELSE ps.precio_venta_usd END AS usd,
         CASE WHEN d.desde_producto THEN TRUE ELSE ps.precio_referencia_confirmada END AS confirmado
  FROM (SELECT ps.precio_venta_ars IS NULL AND ps.precio_venta_usd IS NULL AS desde_producto) d
) e;

COMMENT ON VIEW public.producto_sucursal_catalogo IS
  'Stock con importes resueltos por cotización efectiva del PDV. Sin particular usa la cotización del tenant; sin precio propio usa el precio base del producto.';

REVOKE ALL ON public.producto_catalogo, public.producto_sucursal_catalogo FROM anon, authenticated;
GRANT SELECT ON public.producto_catalogo, public.producto_sucursal_catalogo TO authenticated, service_role;
