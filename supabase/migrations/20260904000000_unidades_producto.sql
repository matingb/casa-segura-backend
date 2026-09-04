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

-- Cambiar columnas a NUMERIC sin escala fija para evitar ceros innecesarios (ej: 4 en vez de 4.0000)
ALTER TABLE public.producto
  ALTER COLUMN alto TYPE NUMERIC,
  ALTER COLUMN ancho TYPE NUMERIC,
  ALTER COLUMN profundidad TYPE NUMERIC,
  ALTER COLUMN peso_unitario TYPE NUMERIC;

