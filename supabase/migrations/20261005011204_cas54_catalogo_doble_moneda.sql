-- CAS-54, etapas 1-3: catálogo vinculado a una cotización manual por empresa.
-- No convierte saldos, operaciones ni importes históricos.
ALTER TABLE public.tenant
  ADD COLUMN cotizacion_usd_ars NUMERIC(18,6),
  ADD COLUMN cotizacion_actualizada_at TIMESTAMPTZ,
  ADD COLUMN cotizacion_actualizada_por UUID REFERENCES public.usuario(id) ON DELETE SET NULL,
  ADD COLUMN cotizacion_version BIGINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT tenant_cotizacion_valida CHECK (
    cotizacion_usd_ars IS NULL OR
    (cotizacion_usd_ars > 0 AND cotizacion_usd_ars < 'Infinity'::numeric
     AND cotizacion_usd_ars <> 'NaN'::numeric)
  );

ALTER TABLE public.producto
  ADD COLUMN moneda_precio_base TEXT NOT NULL DEFAULT 'ARS'
    CHECK (moneda_precio_base IN ('ARS', 'USD')),
  ADD COLUMN precio_base_usd NUMERIC(14,4),
  ADD CONSTRAINT producto_principal_usd_valido CHECK (
    moneda_precio_base <> 'USD' OR
    (precio_base_usd IS NOT NULL AND precio_base_usd >= 0
     AND precio_base_usd < 'Infinity'::numeric AND precio_base_usd <> 'NaN'::numeric)
  );

ALTER TABLE public.producto_sucursal
  ADD COLUMN moneda_precio_venta TEXT NOT NULL DEFAULT 'ARS'
    CHECK (moneda_precio_venta IN ('ARS', 'USD')),
  ADD COLUMN precio_referencia_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN precio_venta_ars_heredado NUMERIC(14,2),
  ADD COLUMN precio_venta_usd_heredado NUMERIC(14,4),
  ADD CONSTRAINT producto_sucursal_principal_usd_valido CHECK (
    moneda_precio_venta <> 'USD' OR
    (precio_venta_usd IS NOT NULL AND precio_venta_usd >= 0
     AND precio_venta_usd < 'Infinity'::numeric AND precio_venta_usd <> 'NaN'::numeric)
  );

-- Preserva los dos importes anteriores aun después de confirmar su referencia.
UPDATE public.producto_sucursal
SET precio_venta_ars_heredado = precio_venta_ars,
    precio_venta_usd_heredado = precio_venta_usd;

INSERT INTO public.permiso (nombre) VALUES ('cotizacion.actualizar') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO public.permiso_rol (id_rol, id_permiso)
SELECT r.id, p.id FROM public.rol r CROSS JOIN public.permiso p
WHERE lower(r.nombre) = 'administrador' AND p.nombre = 'cotizacion.actualizar'
ON CONFLICT DO NOTHING;

-- Una política de aislamiento no autoriza a cualquier miembro a cambiar el dólar.
-- El backend valida el permiso y es el único escritor de las columnas nuevas.
REVOKE UPDATE ON public.tenant FROM authenticated;
GRANT UPDATE (nombre_empresa, updated_at) ON public.tenant TO authenticated;

CREATE FUNCTION public.catalogo_resolver_precio(
  moneda TEXT, ars NUMERIC, usd NUMERIC, cotizacion NUMERIC, confirmado BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'moneda_referencia', moneda,
    'importe_referencia', CASE WHEN moneda = 'USD' THEN usd::text ELSE ars::text END,
    'ars', CASE WHEN moneda = 'USD' THEN round(usd * cotizacion, 2)::text ELSE ars::text END,
    'usd', CASE WHEN moneda = 'USD' THEN usd::text
                WHEN cotizacion > 0 THEN round(ars / cotizacion, 4)::text ELSE NULL END,
    'estado', CASE
      WHEN NOT confirmado AND usd IS NOT NULL THEN 'LEGADO_PENDIENTE_REVISION'
      WHEN (CASE WHEN moneda = 'USD' THEN usd ELSE ars END) IS NULL THEN 'SIN_PRECIO'
      WHEN cotizacion IS NULL THEN 'SIN_COTIZACION'
      ELSE 'VINCULADO' END
  );
$$;
REVOKE ALL ON FUNCTION public.catalogo_resolver_precio(TEXT,NUMERIC,NUMERIC,NUMERIC,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_resolver_precio(TEXT,NUMERIC,NUMERIC,NUMERIC,BOOLEAN) TO authenticated, service_role;

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
    'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario
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
    'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario
FROM public.producto_sucursal ps
JOIN public.producto p ON p.id = ps.producto_id
JOIN public.tenant t ON t.id = p.tenant_id;

REVOKE ALL ON public.producto_catalogo, public.producto_sucursal_catalogo FROM anon, authenticated;
GRANT SELECT ON public.producto_catalogo, public.producto_sucursal_catalogo TO authenticated, service_role;
