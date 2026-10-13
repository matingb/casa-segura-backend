-- Descuento del producto a nivel general, para no tener que repetirlo en cada
-- sucursal. Sigue el mismo patrón que precio_base y costo_reposicion_base:
-- el valor de producto_sucursal especializa al del producto.
--
-- Resolución del nivel 3 de la cascada para una sucursal:
--   1. producto_sucursal.descuento  (si está definido)
--   2. producto.descuento_base      (si no)
-- NULL = no definido y delega; 0 = descuento explícito del 0%.

ALTER TABLE public.producto
  ADD COLUMN descuento_base DECIMAL(5, 2),
  ADD CONSTRAINT producto_descuento_base_check
    CHECK (descuento_base IS NULL OR (descuento_base >= 0 AND descuento_base <= 100));

COMMENT ON COLUMN public.producto.descuento_base IS
  'Descuento porcentual del producto para todas las sucursales. producto_sucursal.descuento lo pisa donde esté definido. NULL = sin descuento a nivel producto.';
