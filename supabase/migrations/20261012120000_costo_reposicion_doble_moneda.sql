-- Costo de reposición con moneda de referencia ARS o USD, mismo modelo que el
-- precio (CAS-54): la columna ARS existente guarda el principal ARS (o la foto
-- del equivalente al guardar), la columna USD el principal USD. Las vistas de
-- catálogo resuelven el equivalente con la cotización vigente del tenant.
-- Los costos existentes quedan como referencia ARS; no se convierte nada.
ALTER TABLE public.producto
  ADD COLUMN moneda_costo_reposicion_base TEXT NOT NULL DEFAULT 'ARS'
    CHECK (moneda_costo_reposicion_base IN ('ARS', 'USD')),
  ADD COLUMN costo_reposicion_base_usd NUMERIC(14,4),
  ADD CONSTRAINT producto_costo_usd_valido CHECK (
    moneda_costo_reposicion_base <> 'USD' OR
    (costo_reposicion_base_usd IS NOT NULL AND costo_reposicion_base_usd >= 0
     AND costo_reposicion_base_usd < 'Infinity'::numeric AND costo_reposicion_base_usd <> 'NaN'::numeric)
  );

ALTER TABLE public.producto_sucursal
  ADD COLUMN moneda_costo_reposicion TEXT NOT NULL DEFAULT 'ARS'
    CHECK (moneda_costo_reposicion IN ('ARS', 'USD')),
  ADD COLUMN costo_reposicion_usd NUMERIC(14,4),
  ADD CONSTRAINT producto_sucursal_costo_usd_valido CHECK (
    moneda_costo_reposicion <> 'USD' OR
    (costo_reposicion_usd IS NOT NULL AND costo_reposicion_usd >= 0
     AND costo_reposicion_usd < 'Infinity'::numeric AND costo_reposicion_usd <> 'NaN'::numeric)
  );

-- p.* / ps.* se expanden al crear la vista: hay que recrearlas para exponer
-- las columnas nuevas.
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
  jsonb_build_object('cotizacion_usd_ars', t.cotizacion_usd_ars::text,
    'cotizacion_version', t.cotizacion_version::text,
    'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario,
  CASE WHEN p.moneda_costo_reposicion_base = 'USD' THEN round(p.costo_reposicion_base_usd * t.cotizacion_usd_ars, 2)
       ELSE p.costo_reposicion_base END AS costo_reposicion_base_ars_resuelto,
  public.catalogo_resolver_precio(p.moneda_costo_reposicion_base, p.costo_reposicion_base,
    p.costo_reposicion_base_usd, t.cotizacion_usd_ars) AS costo_reposicion_base_resuelto
FROM public.producto p JOIN public.tenant t ON t.id = p.tenant_id;

CREATE VIEW public.producto_sucursal_catalogo WITH (security_invoker = true) AS
SELECT ps.*,
  CASE WHEN ps.moneda_precio_venta = 'USD' THEN round(ps.precio_venta_usd * t.cotizacion_usd_ars, 2)
       ELSE ps.precio_venta_ars END AS precio_venta_ars_resuelto,
  CASE WHEN ps.moneda_precio_venta = 'USD' THEN ps.precio_venta_usd
       WHEN t.cotizacion_usd_ars > 0 THEN round(ps.precio_venta_ars / t.cotizacion_usd_ars, 4)
       ELSE NULL END AS precio_venta_usd_resuelto,
  public.catalogo_resolver_precio(ps.moneda_precio_venta, ps.precio_venta_ars, ps.precio_venta_usd,
    t.cotizacion_usd_ars, ps.precio_referencia_confirmada) AS precio_resuelto,
  jsonb_build_object('cotizacion_usd_ars', t.cotizacion_usd_ars::text,
    'cotizacion_version', t.cotizacion_version::text,
    'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario,
  CASE WHEN ps.moneda_costo_reposicion = 'USD' THEN round(ps.costo_reposicion_usd * t.cotizacion_usd_ars, 2)
       ELSE ps.costo_reposicion END AS costo_reposicion_ars_resuelto,
  public.catalogo_resolver_precio(ps.moneda_costo_reposicion, ps.costo_reposicion,
    ps.costo_reposicion_usd, t.cotizacion_usd_ars) AS costo_reposicion_resuelto
FROM public.producto_sucursal ps
JOIN public.producto p ON p.id = ps.producto_id
JOIN public.tenant t ON t.id = p.tenant_id;

REVOKE ALL ON public.producto_catalogo, public.producto_sucursal_catalogo FROM anon, authenticated;
GRANT SELECT ON public.producto_catalogo, public.producto_sucursal_catalogo TO authenticated, service_role;
