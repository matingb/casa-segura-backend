-- =============================================================================
-- Unidades para dimensiones y peso del producto
-- =============================================================================

-- Tipos ENUM
CREATE TYPE public.unidad_dimension AS ENUM ('mm', 'cm', 'm');
CREATE TYPE public.unidad_peso      AS ENUM ('g', 'kg');

-- Nuevas columnas en producto
ALTER TABLE public.producto
  ADD COLUMN unidad_alto          public.unidad_dimension NOT NULL DEFAULT 'cm',
  ADD COLUMN unidad_ancho         public.unidad_dimension NOT NULL DEFAULT 'cm',
  ADD COLUMN unidad_profundidad   public.unidad_dimension NOT NULL DEFAULT 'cm',
  ADD COLUMN unidad_peso_unitario public.unidad_peso      NOT NULL DEFAULT 'kg';

-- Cambiar columnas a NUMERIC(10, 2) para manejar siempre exactamente dos decimales
ALTER TABLE public.producto
  ALTER COLUMN alto TYPE NUMERIC(10, 2),
  ALTER COLUMN ancho TYPE NUMERIC(10, 2),
  ALTER COLUMN profundidad TYPE NUMERIC(10, 2),
  ALTER COLUMN peso_unitario TYPE NUMERIC(10, 2);

