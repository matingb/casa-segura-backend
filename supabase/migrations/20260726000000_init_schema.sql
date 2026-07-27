-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear tabla Tenant
CREATE TABLE public.tenant (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nombre_empresa VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla Usuario
CREATE TABLE public.usuario (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Referencia a auth.users propia de Supabase
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla Producto
CREATE TABLE public.producto (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    codigo VARCHAR(100) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    marca VARCHAR(100),
    modelo VARCHAR(100),
    color VARCHAR(50),
    imagen_url TEXT,
    costo_reposicion DECIMAL(12, 2),
    precio_venta DECIMAL(12, 2),
    iva DECIMAL(5, 2),
    margen_minimo DECIMAL(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices sugeridos para optimizar búsquedas por tenant
CREATE INDEX idx_usuario_tenant_id ON public.usuario(tenant_id);
CREATE INDEX idx_producto_tenant_id ON public.producto(tenant_id);

-- ==========================================
-- Habilitar RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- Configurar Grants para Data API
-- ==========================================
-- Tenant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant TO service_role;

-- Usuario
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuario TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuario TO service_role;

-- Producto
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto TO service_role;

-- ==========================================
-- Función Auxiliar para obtener Tenant ID del usuario actual
-- ==========================================
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.usuario WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ==========================================
-- Políticas RLS
-- ==========================================

-- Tenant: Un usuario autenticado puede ver/editar su propio tenant
CREATE POLICY "tenant_isolation" ON public.tenant
  FOR ALL TO authenticated
  USING (id = public.current_tenant_id());

-- Usuario: Aislamiento a nivel de tenant (los usuarios pueden ver otros usuarios de su mismo tenant)
CREATE POLICY "usuario_isolation" ON public.usuario
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Producto: Aislamiento a nivel de tenant (solo pueden ver/editar productos de su tenant)
CREATE POLICY "producto_isolation" ON public.producto
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id());
