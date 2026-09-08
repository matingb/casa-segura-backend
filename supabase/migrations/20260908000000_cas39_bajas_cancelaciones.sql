ALTER TABLE public.producto
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.producto_sucursal
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.operacion
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_usuario_sucursal_id uuid
    REFERENCES public.usuario_sucursal(id);

CREATE INDEX IF NOT EXISTS producto_tenant_active_idx
  ON public.producto (tenant_id, nombre)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS producto_sucursal_active_idx
  ON public.producto_sucursal (producto_id, sucursal_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS operacion_tenant_active_idx
  ON public.operacion (tenant_id, fecha DESC)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS operacion_tenant_cancelled_idx
  ON public.operacion (tenant_id, cancelled_at DESC)
  WHERE cancelled_at IS NOT NULL;
