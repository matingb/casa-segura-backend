-- ABM de sucursales: baja lógica y descuento propio.
--
-- La baja es lógica porque `producto_sucursal` y `usuario_sucursal` cuelgan de
-- sucursal con ON DELETE CASCADE: borrar la fila se llevaría el stock y los
-- accesos de los usuarios sin dejar rastro.

ALTER TABLE public.sucursal
  ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN descuento DECIMAL(5, 2),
  ADD CONSTRAINT sucursal_descuento_check
    CHECK (descuento IS NULL OR (descuento >= 0 AND descuento <= 100));

CREATE INDEX idx_sucursal_activo ON public.sucursal (tenant_id, activo);

COMMENT ON COLUMN public.sucursal.activo IS
  'Baja lógica. Una sucursal inactiva deja de ofrecerse para operar, pero conserva su stock e historial.';
COMMENT ON COLUMN public.sucursal.descuento IS
  'Descuento propio de la sucursal, en porcentaje. Es independiente de los descuentos por categoría/subcategoría: no participa de esa resolución.';
