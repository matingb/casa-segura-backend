-- Agrega precio de referencia (independiente de sucursal) y código QR al producto.
ALTER TABLE public.producto
  ADD COLUMN precio_base DECIMAL(14, 2),
  ADD COLUMN codigo_qr   VARCHAR(255);
