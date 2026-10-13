-- Nivel 3 de la cascada de descuentos: descuento sobre un producto puntual,
-- por sucursal. Vive en producto_sucursal porque el precio, el costo y el
-- margen mínimo que lo topean también son por sucursal.

ALTER TABLE public.producto_sucursal
  ADD COLUMN descuento DECIMAL(5, 2),
  ADD CONSTRAINT producto_sucursal_descuento_check
    CHECK (descuento IS NULL OR (descuento >= 0 AND descuento <= 100));

COMMENT ON COLUMN public.producto_sucursal.descuento IS
  'Descuento porcentual del producto en esta sucursal (nivel 3 de la cascada). El descuento efectivo queda topeado por margen_minimo al calcular la lista de precios.';
