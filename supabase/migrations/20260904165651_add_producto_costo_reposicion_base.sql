-- El precio de venta base y el costo de reposicion base son referencias distintas.
ALTER TABLE public.producto
  ADD COLUMN IF NOT EXISTS costo_reposicion_base DECIMAL(14, 2);

COMMENT ON COLUMN public.producto.costo_reposicion_base IS
  'Costo de reposicion general usado como valor inicial al configurar el stock por sucursal.';
