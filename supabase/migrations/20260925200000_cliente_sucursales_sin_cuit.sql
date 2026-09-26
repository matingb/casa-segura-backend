-- Clientes: se identifican solo por tipo + número de documento (el CUIT era
-- redundante, ya que se puede cargar como tipo_documento = 'CUIT'), y pasan a
-- estar asociados a una o más sucursales.

ALTER TABLE public.cliente
  DROP COLUMN cuit;

-- Un cliente puede ser atendido por varias sucursales, siguiendo el mismo
-- patrón que usuario_sucursal.
CREATE TABLE public.cliente_sucursal (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id  UUID NOT NULL REFERENCES public.cliente(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (cliente_id, sucursal_id)
);

CREATE INDEX idx_cliente_sucursal_cliente  ON public.cliente_sucursal(cliente_id);
CREATE INDEX idx_cliente_sucursal_sucursal ON public.cliente_sucursal(sucursal_id);

COMMENT ON TABLE public.cliente_sucursal IS
  'Sucursales que atienden a cada cliente. Todo cliente debe tener al menos una; la aplicación lo valida al crear y actualizar.';
