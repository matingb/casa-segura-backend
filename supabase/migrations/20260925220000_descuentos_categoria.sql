-- Descuentos por categoría/subcategoría, con excepciones por sucursal.
--
-- Resolución (de mayor a menor prioridad) para un producto en una sucursal:
--   1. excepción de su subcategoría en esa sucursal
--   2. descuento general de su subcategoría
--   3. excepción de su categoría en esa sucursal
--   4. descuento general de su categoría
-- Lo más específico gana. NULL significa "no definido", y se delega al
-- siguiente nivel; 0 es un descuento explícito del 0%.

ALTER TABLE public.tipo
  ADD COLUMN descuento_general DECIMAL(5, 2),
  ADD CONSTRAINT tipo_descuento_general_check
    CHECK (descuento_general IS NULL OR (descuento_general >= 0 AND descuento_general <= 100));

ALTER TABLE public.subtipo
  ADD COLUMN descuento_general DECIMAL(5, 2),
  ADD CONSTRAINT subtipo_descuento_general_check
    CHECK (descuento_general IS NULL OR (descuento_general >= 0 AND descuento_general <= 100));

-- Excepciones: un porcentaje distinto para una sucursal puntual. Cada fila
-- apunta a una categoría o a una subcategoría, nunca a ambas ni a ninguna.
CREATE TABLE public.descuento_categoria_sucursal (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo_id     UUID REFERENCES public.tipo(id) ON DELETE CASCADE,
    subtipo_id  UUID REFERENCES public.subtipo(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    porcentaje  DECIMAL(5, 2) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT descuento_categoria_sucursal_porcentaje_check
      CHECK (porcentaje >= 0 AND porcentaje <= 100),
    CONSTRAINT descuento_categoria_sucursal_destino_check
      CHECK (num_nonnulls(tipo_id, subtipo_id) = 1)
);

-- Una sola excepción por categoría/subcategoría y sucursal.
CREATE UNIQUE INDEX idx_descuento_tipo_sucursal
  ON public.descuento_categoria_sucursal (tipo_id, sucursal_id)
  WHERE tipo_id IS NOT NULL;

CREATE UNIQUE INDEX idx_descuento_subtipo_sucursal
  ON public.descuento_categoria_sucursal (subtipo_id, sucursal_id)
  WHERE subtipo_id IS NOT NULL;

CREATE INDEX idx_descuento_sucursal ON public.descuento_categoria_sucursal (sucursal_id);

COMMENT ON COLUMN public.tipo.descuento_general IS
  'Descuento porcentual que aplica a todas las sucursales, salvo las que tengan una excepción en descuento_categoria_sucursal. NULL = sin descuento definido.';
COMMENT ON COLUMN public.subtipo.descuento_general IS
  'Descuento porcentual de la subcategoría. Tiene prioridad sobre el de su categoría. NULL = hereda el de la categoría.';
COMMENT ON TABLE public.descuento_categoria_sucursal IS
  'Excepciones por sucursal al descuento general de una categoría o subcategoría. Todavía no se aplica automáticamente en las ventas.';
