-- =============================================================================
-- CasaSegura — Esquema completo según DER
-- =============================================================================

-- ============================================================
-- TABLAS BASE (sin dependencias o solo de tenant)
-- ============================================================

-- Tenant
CREATE TABLE public.tenant (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre_empresa VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sucursal
CREATE TABLE public.sucursal (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nombre      VARCHAR(255) NOT NULL,
    es_central  BOOLEAN NOT NULL DEFAULT FALSE,
    valor_dolar DECIMAL(12, 4),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rol
CREATE TABLE public.rol (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nombre      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permiso
CREATE TABLE public.permiso (
    id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- Permiso_Rol (tabla pivote)
CREATE TABLE public.permiso_rol (
    id_rol     UUID NOT NULL REFERENCES public.rol(id) ON DELETE CASCADE,
    id_permiso UUID NOT NULL REFERENCES public.permiso(id) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, id_permiso)
);

-- Proveedor
CREATE TABLE public.proveedor (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nombre     VARCHAR(255) NOT NULL,
    cuit       VARCHAR(20),
    email      VARCHAR(255),
    telefono   VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tipo
CREATE TABLE public.tipo (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nombre     VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subtipo
CREATE TABLE public.subtipo (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo_id    UUID NOT NULL REFERENCES public.tipo(id) ON DELETE CASCADE,
    nombre     VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cuenta Financiera
CREATE TABLE public.cuenta_financiera (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id         UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    nombre            VARCHAR(100) NOT NULL,
    saldo_inicial     DECIMAL(14, 2) NOT NULL DEFAULT 0,
    saldo_actual      DECIMAL(14, 2) NOT NULL DEFAULT 0,
    porcentaje_extra  DECIMAL(5, 2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tipo de Operación (catálogo fijo: Compra, Venta, Traslado, Movimiento)
CREATE TABLE public.tipo_operacion (
    id     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- ============================================================
-- USUARIO (referencia auth.users de Supabase)
-- ============================================================
CREATE TABLE public.usuario (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    auth_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email      VARCHAR(255),
    nombre     VARCHAR(255) NOT NULL,
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usuario_Sucursal (acceso de un usuario a una sucursal con un rol)
CREATE TABLE public.usuario_sucursal (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id  UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    id_rol      UUID NOT NULL REFERENCES public.rol(id),
    UNIQUE (usuario_id, sucursal_id)
);

-- ============================================================
-- PRODUCTO (genérico, sin precios — eso va en producto_sucursal)
-- ============================================================
CREATE TABLE public.producto (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id               UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    subtipo_id              UUID REFERENCES public.subtipo(id) ON DELETE SET NULL,
    codigo                  VARCHAR(100) NOT NULL,
    codigo_barra_proveedor  VARCHAR(100),
    nombre                  VARCHAR(255) NOT NULL,
    marca                   VARCHAR(100),
    modelo                  VARCHAR(100),
    color                   VARCHAR(50),
    presentacion            VARCHAR(100),
    alto                    DECIMAL(10, 4),
    ancho                   DECIMAL(10, 4),
    profundidad             DECIMAL(10, 4),
    peso_unitario           DECIMAL(10, 4),
    imagen_url              TEXT,
    descripcion             TEXT,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tenant_id, codigo)
);

-- Producto_Sucursal (precio, stock y configuración por sucursal)
CREATE TABLE public.producto_sucursal (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id         UUID NOT NULL REFERENCES public.producto(id) ON DELETE CASCADE,
    sucursal_id         UUID NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
    habilitado          BOOLEAN NOT NULL DEFAULT TRUE,
    costo_reposicion    DECIMAL(14, 2),
    precio_venta_ars    DECIMAL(14, 2),
    precio_venta_usd    DECIMAL(14, 4),
    iva                 DECIMAL(5, 2) DEFAULT 21,
    margen_minimo       DECIMAL(5, 2),
    stock_minimo        INTEGER NOT NULL DEFAULT 0,
    cantidad_disponible INTEGER NOT NULL DEFAULT 0,
    cantidad_reservada  INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (producto_id, sucursal_id)
);

-- ============================================================
-- OPERACIONES
-- ============================================================

-- Operación (cabecera genérica de toda transacción)
CREATE TABLE public.operacion (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    usuario_sucursal_id UUID NOT NULL REFERENCES public.usuario_sucursal(id),
    tipo_id             UUID NOT NULL REFERENCES public.tipo_operacion(id),
    fecha               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Operación Detalle (líneas de producto dentro de una operación)
CREATE TABLE public.operacion_detalle (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operacion_id         UUID NOT NULL REFERENCES public.operacion(id) ON DELETE CASCADE,
    producto_sucursal_id UUID NOT NULL REFERENCES public.producto_sucursal(id),
    cantidad             INTEGER NOT NULL CHECK (cantidad > 0),
    alicuota_iva         DECIMAL(5, 2),
    iva_ars              DECIMAL(14, 2),
    iva_usd              DECIMAL(14, 4),
    precio_unit_ars      DECIMAL(14, 2),
    precio_unit_usd      DECIMAL(14, 4),
    costo_unit_ars       DECIMAL(14, 2),
    costo_unit_usd       DECIMAL(14, 4)
);

-- Compra (extensión de operación para compras a proveedor)
CREATE TABLE public.compra (
    operacion_id         UUID PRIMARY KEY REFERENCES public.operacion(id) ON DELETE CASCADE,
    proveedor_id         UUID NOT NULL REFERENCES public.proveedor(id),
    numero_remito        VARCHAR(100),
    numero_factura       VARCHAR(100),
    subtotal_ars         DECIMAL(14, 2),
    subtotal_usd         DECIMAL(14, 4),
    otros_impuestos_ars  DECIMAL(14, 2),
    otros_impuestos_usd  DECIMAL(14, 4),
    total_ars            DECIMAL(14, 2),
    total_usd            DECIMAL(14, 4)
);

-- Venta (extensión de operación para ventas)
CREATE TABLE public.venta (
    operacion_id       UUID PRIMARY KEY REFERENCES public.operacion(id) ON DELETE CASCADE,
    numero_comprobante VARCHAR(100),
    subtotal_ars       DECIMAL(14, 2),
    subtotal_usd       DECIMAL(14, 4),
    descuento_ars      DECIMAL(14, 2),
    descuento_usd      DECIMAL(14, 4),
    total_ars          DECIMAL(14, 2),
    total_usd          DECIMAL(14, 4)
);

-- Traslado (extensión de operación para trasladar stock entre sucursales)
CREATE TABLE public.traslado (
    operacion_id        UUID PRIMARY KEY REFERENCES public.operacion(id) ON DELETE CASCADE,
    sucursal_destino_id UUID NOT NULL REFERENCES public.sucursal(id),
    traslado_id         UUID,   -- referencia opcional a otro traslado relacionado
    costo_flete_ars     DECIMAL(14, 2)
);

-- Movimiento (extensión de operación para movimientos financieros libres)
CREATE TABLE public.movimiento (
    operacion_id UUID PRIMARY KEY REFERENCES public.operacion(id) ON DELETE CASCADE,
    tipo         VARCHAR(50),
    descripcion  TEXT,
    monto_ars    DECIMAL(14, 2),
    monto_usd    DECIMAL(14, 4)
);

-- Operación_Cuenta (distribución de medios de pago de una operación)
CREATE TABLE public.operacion_cuenta (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operacion_id        UUID NOT NULL REFERENCES public.operacion(id) ON DELETE CASCADE,
    cuenta_financiera_id UUID NOT NULL REFERENCES public.cuenta_financiera(id),
    porcentaje_venta    DECIMAL(5, 2),
    porcentaje_extra    DECIMAL(5, 2),
    monto_ars           DECIMAL(14, 2),
    monto_usd           DECIMAL(14, 4)
);

-- Pedido de Reposición
CREATE TABLE public.pedido_reposicion (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id            UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    producto_sucursal_id UUID NOT NULL REFERENCES public.producto_sucursal(id),
    usuario_id           UUID NOT NULL REFERENCES public.usuario(id),
    proveedor_id         UUID NOT NULL REFERENCES public.proveedor(id),
    cantidad             INTEGER NOT NULL CHECK (cantidad > 0),
    estado               VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    origen               VARCHAR(50),
    fecha                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_usuario_tenant_id         ON public.usuario(tenant_id);
CREATE INDEX idx_usuario_auth_id           ON public.usuario(auth_id);
CREATE INDEX idx_sucursal_tenant_id        ON public.sucursal(tenant_id);
CREATE INDEX idx_rol_tenant_id             ON public.rol(tenant_id);
CREATE INDEX idx_proveedor_tenant_id       ON public.proveedor(tenant_id);
CREATE INDEX idx_tipo_tenant_id            ON public.tipo(tenant_id);
CREATE INDEX idx_subtipo_tipo_id           ON public.subtipo(tipo_id);
CREATE INDEX idx_producto_tenant_id        ON public.producto(tenant_id);
CREATE INDEX idx_producto_subtipo_id       ON public.producto(subtipo_id);
CREATE INDEX idx_producto_sucursal_prod    ON public.producto_sucursal(producto_id);
CREATE INDEX idx_producto_sucursal_suc     ON public.producto_sucursal(sucursal_id);
CREATE INDEX idx_operacion_tenant_id       ON public.operacion(tenant_id);
CREATE INDEX idx_operacion_tipo_id         ON public.operacion(tipo_id);
CREATE INDEX idx_operacion_det_op          ON public.operacion_detalle(operacion_id);
CREATE INDEX idx_pedido_tenant_id          ON public.pedido_reposicion(tenant_id);
CREATE INDEX idx_cuenta_financiera_tenant  ON public.cuenta_financiera(tenant_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.tenant             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursal           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permiso            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permiso_rol        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedor          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtipo            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta_financiera  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_operacion     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_sucursal   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_sucursal  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacion          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacion_detalle  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traslado           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimiento         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operacion_cuenta   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_reposicion  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCIÓN AUXILIAR — tenant del usuario autenticado actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.usuario WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- GRANTS
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'tenant','usuario','sucursal','rol','permiso','permiso_rol',
    'proveedor','tipo','subtipo','cuenta_financiera','tipo_operacion',
    'usuario_sucursal','producto','producto_sucursal','operacion',
    'operacion_detalle','compra','venta','traslado','movimiento',
    'operacion_cuenta','pedido_reposicion'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role;', tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- POLÍTICAS RLS (aislamiento por tenant)
-- ============================================================

-- tenant: cada usuario ve solo su tenant
CREATE POLICY "tenant_isolation" ON public.tenant
  FOR ALL TO authenticated
  USING (id = public.current_tenant_id());

-- Tablas con tenant_id directo
CREATE POLICY "isolation" ON public.usuario
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.sucursal
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.rol
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.proveedor
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.tipo
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.producto
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.cuenta_financiera
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.operacion
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

CREATE POLICY "isolation" ON public.pedido_reposicion
  FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id());

-- Tablas sin tenant_id directo — acceso via join implícito (service_role bypass)
-- tipo_operacion y permiso son catálogos globales: todos pueden leer
CREATE POLICY "public_read" ON public.tipo_operacion
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "public_read" ON public.permiso
  FOR SELECT TO authenticated USING (TRUE);

-- Las demás se gestionan via service_role desde el backend (RLS permisiva para authenticated)
CREATE POLICY "isolation" ON public.subtipo
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tipo t WHERE t.id = subtipo.tipo_id AND t.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.usuario_sucursal
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.usuario u WHERE u.id = usuario_sucursal.usuario_id AND u.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.permiso_rol
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.rol r WHERE r.id = permiso_rol.id_rol AND r.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.producto_sucursal
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.producto p WHERE p.id = producto_sucursal.producto_id AND p.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.operacion_detalle
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = operacion_detalle.operacion_id AND o.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.compra
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = compra.operacion_id AND o.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.venta
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = venta.operacion_id AND o.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.traslado
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = traslado.operacion_id AND o.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.movimiento
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = movimiento.operacion_id AND o.tenant_id = public.current_tenant_id())
  );

CREATE POLICY "isolation" ON public.operacion_cuenta
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.operacion o WHERE o.id = operacion_cuenta.operacion_id AND o.tenant_id = public.current_tenant_id())
  );
