-- CAS-48: permite identificar cuándo se modificó por última vez el impacto
-- físico de cada renglón. El historial previo no conserva esa fecha, así que
-- para impactos existentes se usa la fecha de creación de la operación.
ALTER TABLE public.operacion_detalle
  ADD COLUMN ultima_modificacion_stock_at TIMESTAMP WITH TIME ZONE;

UPDATE public.operacion_detalle od
SET ultima_modificacion_stock_at = o.created_at
FROM public.operacion o
WHERE o.id = od.operacion_id
  AND od.cantidad_impactada_stock > 0;

COMMENT ON COLUMN public.operacion_detalle.ultima_modificacion_stock_at IS
  'Fecha y hora del último cambio en cantidad_impactada_stock. Los impactos anteriores a esta columna se inicializan con la fecha de creación de la operación.';
