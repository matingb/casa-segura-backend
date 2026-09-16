-- CAS-48: compra/venta y su impacto físico de stock se registran por separado.
-- Las operaciones existentes fueron creadas antes de este flujo y ya habían
-- impactado todo su stock, por eso se inicializan como completas.
ALTER TABLE public.operacion_detalle
  ADD COLUMN cantidad_impactada_stock INTEGER NOT NULL DEFAULT 0;

UPDATE public.operacion_detalle od
SET cantidad_impactada_stock = od.cantidad
FROM public.operacion o
JOIN public.tipo_operacion tipo ON tipo.id = o.tipo_id
WHERE o.id = od.operacion_id
  AND tipo.nombre IN ('Compra', 'Venta');

ALTER TABLE public.operacion_detalle
  ADD CONSTRAINT operacion_detalle_cantidad_impactada_stock_check
  CHECK (
    cantidad_impactada_stock >= 0
    AND cantidad_impactada_stock <= cantidad
  );

CREATE INDEX operacion_detalle_stock_pendiente_idx
  ON public.operacion_detalle (operacion_id)
  WHERE cantidad_impactada_stock < cantidad;

COMMENT ON COLUMN public.operacion_detalle.cantidad_impactada_stock IS
  'Cantidad acumulada que ya modificó el stock físico. CAS-48 no conserva el historial individual de impactos.';
