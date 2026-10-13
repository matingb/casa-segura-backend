-- CAS-45: la operación comercial puede existir antes de su pago/cobro.
-- `operacion_cuenta` pasa a ser el historial de cada pago/cobro efectuado.

ALTER TABLE public.operacion
  ADD COLUMN estado_financiero VARCHAR(20);

ALTER TABLE public.operacion
  ADD CONSTRAINT operacion_estado_financiero_check
  CHECK (
    estado_financiero IS NULL
    OR estado_financiero IN ('PENDIENTE', 'PARCIAL', 'SALDADA', 'SOBREPAGADA')
  );

ALTER TABLE public.operacion_cuenta
  ADD COLUMN fecha_efectiva TIMESTAMP WITH TIME ZONE,
  ADD COLUMN observacion TEXT;

-- Las líneas existentes representan el pago/cobro que se registró al crear
-- la operación, por lo que conservan la fecha comercial original.
UPDATE public.operacion_cuenta oc
SET fecha_efectiva = o.fecha
FROM public.operacion o
WHERE o.id = oc.operacion_id;

ALTER TABLE public.operacion_cuenta
  ALTER COLUMN fecha_efectiva SET NOT NULL,
  ALTER COLUMN fecha_efectiva SET DEFAULT NOW();

-- Antes de CAS-45 toda compra/venta se creaba con sus cuentas. Si hubiera
-- datos históricos sin líneas financieras, quedan visibles como pendientes.
UPDATE public.operacion o
SET estado_financiero = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.operacion_cuenta oc
    WHERE oc.operacion_id = o.id
  ) THEN 'SALDADA'
  ELSE 'PENDIENTE'
END
FROM public.tipo_operacion tipo
WHERE tipo.id = o.tipo_id
  AND tipo.nombre IN ('Compra', 'Venta');

CREATE INDEX idx_operacion_estado_financiero
  ON public.operacion (tenant_id, estado_financiero)
  WHERE estado_financiero IS NOT NULL;

CREATE INDEX idx_operacion_cuenta_historial
  ON public.operacion_cuenta (operacion_id, fecha_efectiva);
