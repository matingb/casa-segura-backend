-- Migración: Descuentos en cadena para clientes (3 niveles: Región, Categoría/Subcategoría, Producto)
-- Manteniendo el campo cliente.descuento_porcentaje (descuento general/habitual del cliente).

-- ============================================================================
-- 1. Regiones por punto de venta (sucursal)
-- ============================================================================
CREATE TABLE public.region (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    descuento   DECIMAL(5, 2) NOT NULL DEFAULT 0,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT region_descuento_check
        CHECK (descuento >= 0 AND descuento <= 100),
    CONSTRAINT region_nombre_unique
        UNIQUE (sucursal_id, nombre)
);

CREATE INDEX idx_region_tenant_sucursal ON public.region(tenant_id, sucursal_id);
CREATE INDEX idx_region_activo ON public.region(sucursal_id, activo);

COMMENT ON TABLE public.region IS
  'Regiones comerciales gestionadas por cada punto de venta (sucursal) con su descuento porcentual.';

-- ============================================================================
-- 2. Asignación de Región al Cliente por Sucursal
-- ============================================================================
CREATE TABLE public.cliente_region (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id  UUID NOT NULL REFERENCES public.cliente(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    region_id   UUID NOT NULL REFERENCES public.region(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Un cliente solo puede tener una región por sucursal
    CONSTRAINT cliente_region_cliente_sucursal_unique
        UNIQUE (cliente_id, sucursal_id)
);

CREATE INDEX idx_cliente_region_cliente ON public.cliente_region(cliente_id);
CREATE INDEX idx_cliente_region_sucursal ON public.cliente_region(sucursal_id);
CREATE INDEX idx_cliente_region_region ON public.cliente_region(region_id);

COMMENT ON TABLE public.cliente_region IS
  'Asignación de región a un cliente para una sucursal específica.';

-- ============================================================================
-- 3. Descuentos por Categoría / Subcategoría a nivel Cliente
-- ============================================================================
CREATE TABLE public.cliente_descuento_categoria (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id  UUID NOT NULL REFERENCES public.cliente(id) ON DELETE CASCADE,
    tipo_id     UUID REFERENCES public.tipo(id) ON DELETE CASCADE,
    subtipo_id  UUID REFERENCES public.subtipo(id) ON DELETE CASCADE,
    porcentaje  DECIMAL(5, 2) NOT NULL,
    nota        TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT cliente_desc_cat_porcentaje_check
        CHECK (porcentaje >= 0 AND porcentaje <= 100),
    -- Apunta a categoría O subcategoría, nunca a ambas ni a ninguna
    CONSTRAINT cliente_desc_cat_destino_check
        CHECK (num_nonnulls(tipo_id, subtipo_id) = 1)
);

CREATE UNIQUE INDEX idx_cliente_desc_tipo
    ON public.cliente_descuento_categoria (cliente_id, tipo_id)
    WHERE tipo_id IS NOT NULL;

CREATE UNIQUE INDEX idx_cliente_desc_subtipo
    ON public.cliente_descuento_categoria (cliente_id, subtipo_id)
    WHERE subtipo_id IS NOT NULL;

CREATE INDEX idx_cliente_desc_cat_cliente ON public.cliente_descuento_categoria(cliente_id);

COMMENT ON TABLE public.cliente_descuento_categoria IS
  'Descuento específico otorgado a un cliente para una categoría o subcategoría particular.';

-- ============================================================================
-- 4. Descuentos por Producto Específico a nivel Cliente
-- ============================================================================
CREATE TABLE public.cliente_descuento_producto (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id  UUID NOT NULL REFERENCES public.cliente(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES public.producto(id) ON DELETE CASCADE,
    porcentaje  DECIMAL(5, 2) NOT NULL,
    nota        TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT cliente_desc_prod_porcentaje_check
        CHECK (porcentaje >= 0 AND porcentaje <= 100),
    CONSTRAINT cliente_desc_prod_unique
        UNIQUE (cliente_id, producto_id)
);

CREATE INDEX idx_cliente_desc_prod_cliente ON public.cliente_descuento_producto(cliente_id);
CREATE INDEX idx_cliente_desc_prod_producto ON public.cliente_descuento_producto(producto_id);

COMMENT ON TABLE public.cliente_descuento_producto IS
  'Descuento puntual otorgado a un cliente para un producto específico.';
