-- Módulo de Clientes: entidad comercial a la que se le vende.
-- Vive a nivel tenant, como proveedor: todas las sucursales comparten la cartera.
-- No usa deleted_at; la baja es lógica a través de `activo`.

CREATE TABLE public.cliente (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id            UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,

    -- Identificación
    nombre               VARCHAR(255) NOT NULL,
    tipo_cliente         VARCHAR(20) NOT NULL DEFAULT 'persona',
    razon_social         VARCHAR(255),
    nombre_contacto      VARCHAR(255),

    -- Datos fiscales
    cuit                 VARCHAR(20),
    tipo_documento       VARCHAR(20),
    nro_documento        VARCHAR(50),
    condicion_iva        VARCHAR(100),

    -- Contacto
    email                VARCHAR(255),
    telefono             VARCHAR(50),

    -- Domicilio
    direccion            VARCHAR(255),
    localidad            VARCHAR(100),
    provincia            VARCHAR(100),
    codigo_postal        VARCHAR(20),

    -- Comercial
    descuento_porcentaje DECIMAL(5, 2),

    observaciones        TEXT,
    activo               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT cliente_tipo_cliente_check
        CHECK (tipo_cliente IN ('persona', 'empresa')),
    CONSTRAINT cliente_descuento_porcentaje_check
        CHECK (descuento_porcentaje IS NULL OR (descuento_porcentaje >= 0 AND descuento_porcentaje <= 100))
);

CREATE INDEX idx_cliente_tenant_id ON public.cliente(tenant_id);
CREATE INDEX idx_cliente_nombre    ON public.cliente(tenant_id, nombre);

COMMENT ON COLUMN public.cliente.condicion_iva IS
  'Condición frente al IVA en texto libre (Responsable Inscripto, Monotributo, Consumidor Final, Exento, ...). El formulario sugiere las habituales pero admite otras.';
COMMENT ON COLUMN public.cliente.descuento_porcentaje IS
  'Descuento comercial habitual del cliente, en porcentaje. Informativo: todavía no lo consume el alta de ventas.';
