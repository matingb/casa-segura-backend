-- =============================================================================
-- CasaSegura — Seed completo (cubre todas las entidades del DER)
-- =============================================================================

-- Activar extensión para cifrado de contraseñas
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- UUIDs usados (fijos para facilitar referencias cruzadas)
-- =============================================================================
--  Tenant:              00000000-0000-0000-0000-000000000001
--  Auth Users:          00000000-0000-0000-0000-00000000000A  (admin)
--                       00000000-0000-0000-0000-00000000000B  (vendedor)
--                       00000000-0000-0000-0000-00000000000C  (otro usuario)
--  Usuarios public:     00000000-0000-0000-0000-000000000010  (Matias Admin)
--                       00000000-0000-0000-0000-000000000011  (Nacho Romero)
--                       00000000-0000-0000-0000-000000000012  (Donatella Fragassi)
--  Sucursales:          00000000-0000-0000-0000-000000000020  (Central)
--                       00000000-0000-0000-0000-000000000021  (Sucursal Norte)
--  Roles:               00000000-0000-0000-0000-000000000030  (Administrador)
--                       00000000-0000-0000-0000-000000000031  (Vendedor)
--  Permisos:            00000000-0000-0000-0000-000000000040..0047
--  Proveedores:         00000000-0000-0000-0000-000000000050..0052
--  Tipos:               00000000-0000-0000-0000-000000000060  (Camaras)
--                       00000000-0000-0000-0000-000000000061  (Accesorios)
--  Subtipos:            00000000-0000-0000-0000-000000000070..0073
--  Productos:           00000000-0000-0000-0000-000000000080..0084
--  Prod Sucursal:       00000000-0000-0000-0000-000000000090..0099  (5 prods x 2 suc)
--  Cuentas financieras: 00000000-0000-0000-0000-0000000000A0  (Efectivo)
--                       00000000-0000-0000-0000-0000000000A1  (Transferencia)
--  Tipo Operacion:      00000000-0000-0000-0000-0000000000B0  (Compra)
--                       00000000-0000-0000-0000-0000000000B1  (Venta)
--                       00000000-0000-0000-0000-0000000000B2  (Traslado)
--                       00000000-0000-0000-0000-0000000000B3  (Movimiento)
--  Usuario_Sucursal:    00000000-0000-0000-0000-0000000000C0..C3
--  Operaciones:         00000000-0000-0000-0000-0000000000D0  (compra)
--                       00000000-0000-0000-0000-0000000000D1  (venta)
--  Pedido Reposicion:   00000000-0000-0000-0000-0000000000E0

-- =============================================================================
-- 1. TENANT
-- =============================================================================
INSERT INTO public.tenant (id, nombre_empresa)
VALUES ('00000000-0000-0000-0000-000000000001', 'Casa Segura SRL');

-- =============================================================================
-- 2. AUTH.USERS (Supabase Auth)
-- =============================================================================

-- Admin
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-00000000000A',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@casasegura.com',
    crypt('12345678', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000000A',
    '00000000-0000-0000-0000-00000000000A',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-00000000000A', 'admin@casasegura.com')::jsonb,
    'email', now(), now(), now()
);

-- Vendedor
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-00000000000B',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'nacho@casasegura.com',
    crypt('12345678', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000000B',
    '00000000-0000-0000-0000-00000000000B',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-00000000000B', 'nacho@casasegura.com')::jsonb,
    'email', now(), now(), now()
);

-- Otro usuario
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-00000000000C',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'donatella@casasegura.com',
    crypt('12345678', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-00000000000C',
    '00000000-0000-0000-0000-00000000000C',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-00000000000C', 'donatella@casasegura.com')::jsonb,
    'email', now(), now(), now()
);

-- =============================================================================
-- 3. USUARIOS (public)
-- =============================================================================
INSERT INTO public.usuario (id, tenant_id, auth_id, email, nombre, activo)
VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000A', 'admin@casasegura.com',     'Matias Admin',      TRUE),
    ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000B', 'nacho@casasegura.com',     'Nacho Romero',      TRUE),
    ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000C', 'donatella@casasegura.com', 'Donatella Fragassi',TRUE);

-- =============================================================================
-- 4. SUCURSALES
-- =============================================================================
INSERT INTO public.sucursal (id, tenant_id, nombre, es_central, valor_dolar)
VALUES
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Casa Central',    TRUE,  1200.00),
    ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Sucursal Norte',  FALSE, 1200.00);

-- =============================================================================
-- 5. ROLES
-- =============================================================================
INSERT INTO public.rol (id, tenant_id, nombre)
VALUES
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'Administrador'),
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Vendedor');

-- =============================================================================
-- 6. PERMISOS
-- =============================================================================
INSERT INTO public.permiso (id, nombre)
VALUES
    ('00000000-0000-0000-0000-000000000040', 'productos.ver'),
    ('00000000-0000-0000-0000-000000000041', 'productos.editar'),
    ('00000000-0000-0000-0000-000000000042', 'ventas.crear'),
    ('00000000-0000-0000-0000-000000000043', 'ventas.ver'),
    ('00000000-0000-0000-0000-000000000044', 'compras.crear'),
    ('00000000-0000-0000-0000-000000000045', 'compras.ver'),
    ('00000000-0000-0000-0000-000000000046', 'reportes.ver'),
    ('00000000-0000-0000-0000-000000000047', 'usuarios.administrar');

-- Administrador tiene todos los permisos
INSERT INTO public.permiso_rol (id_rol, id_permiso)
VALUES
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000040'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000041'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000042'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000043'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000044'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000045'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000046'),
    ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000047');

-- Vendedor: solo ver y crear ventas/compras
INSERT INTO public.permiso_rol (id_rol, id_permiso)
VALUES
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000040'),
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000042'),
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000043'),
    ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000045');

-- =============================================================================
-- 7. PROVEEDORES
-- =============================================================================
INSERT INTO public.proveedor (id, tenant_id, nombre, cuit, email, telefono)
VALUES
    ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', 'Dahua Technology Argentina', '30-71234567-0', 'ventas@dahua.com.ar',    '011-4444-5555'),
    ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', 'Hikvision Argentina',        '30-71234568-0', 'ventas@hikvision.com.ar', '011-4444-6666'),
    ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', 'Distribuidora TechSeg',      '20-12345678-9', 'compras@techseg.com.ar',  '011-4444-7777');

-- =============================================================================
-- 8. TIPOS Y SUBTIPOS DE PRODUCTO
-- =============================================================================
INSERT INTO public.tipo (id, tenant_id, nombre)
VALUES
    ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', 'Videovigilancia'),
    ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', 'Alarmas y Sensores');

INSERT INTO public.subtipo (id, tipo_id, nombre)
VALUES
    ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', 'Cámaras Exterior'),
    ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060', 'DVR / NVR'),
    ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000061', 'Sensores de Movimiento'),
    ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000061', 'Sirenas');

-- =============================================================================
-- 9. PRODUCTOS (genéricos, sin precio/stock)
-- =============================================================================
INSERT INTO public.producto (id, tenant_id, subtipo_id, codigo, nombre, marca, modelo, descripcion, activo)
VALUES
    ('00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000070', 'PROD-001', 'Cámara Exterior 1080p',          'Dahua',         'DH-IPC-HFW2831T', 'Cámara IP exterior resolución 1080p con IR 30m', TRUE),
    ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000071', 'PROD-002', 'DVR 4 Canales 4K',               'Hikvision',     'DS-7204HUHI-K1',  'DVR TurboHD 4 canales resolución 4K',           TRUE),
    ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000071', 'PROD-003', 'Disco Rígido 2TB Purple',        'Western Digital','WD20PURZ',        'HDD especial para videovigilancia 24/7',         TRUE),
    ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000072', 'PROD-004', 'Sensor de Movimiento PIR Dual',  'DSC',           'LC-100-PI',       'Detector dual PIR cobertura 12m x 90°',          TRUE),
    ('00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000073', 'PROD-005', 'Sirena Interior 110dB',          'Alonso',        'MP-100',          'Sirena interior alto impacto 110dB',             TRUE);

-- =============================================================================
-- 10. PRODUCTO_SUCURSAL (precio y stock por sucursal)
-- =============================================================================
-- Casa Central
INSERT INTO public.producto_sucursal (id, producto_id, sucursal_id, habilitado, costo_reposicion, precio_venta_ars, precio_venta_usd, iva, margen_minimo, stock_minimo, cantidad_disponible)
VALUES
    ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000020', TRUE, 28000, 45000, 37.50, 21, 15, 5, 20),
    ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000020', TRUE, 42000, 65000, 54.17, 21, 20, 3, 8),
    ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000020', TRUE, 22000, 35000, 29.17, 21, 15, 5, 15),
    ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000020', TRUE,  7500, 12000,  10.00, 21, 20, 10, 35),
    ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000020', TRUE,  5000,  8500,   7.08, 21, 20, 10, 40);

-- Sucursal Norte
INSERT INTO public.producto_sucursal (id, producto_id, sucursal_id, habilitado, costo_reposicion, precio_venta_ars, precio_venta_usd, iva, margen_minimo, stock_minimo, cantidad_disponible)
VALUES
    ('00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000021', TRUE, 28000, 46000, 38.33, 21, 15, 3, 10),
    ('00000000-0000-0000-0000-000000000096', '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000021', TRUE, 42000, 66000, 55.00, 21, 20, 2, 4),
    ('00000000-0000-0000-0000-000000000097', '00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000021', TRUE, 22000, 36000, 30.00, 21, 15, 3, 7),
    ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000021', FALSE, 7500, 12000, 10.00, 21, 20, 5, 0),
    ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000021', TRUE,  5000,  8800,   7.33, 21, 20, 5, 18);

-- =============================================================================
-- 11. CUENTAS FINANCIERAS
-- =============================================================================
INSERT INTO public.cuenta_financiera (id, tenant_id, nombre, saldo_inicial, saldo_actual, porcentaje_extra)
VALUES
    ('00000000-0000-0000-0000-0000000000A0', '00000000-0000-0000-0000-000000000001', 'Efectivo',        50000, 50000,  0),
    ('00000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-000000000001', 'Transferencia',  100000,100000,  0),
    ('00000000-0000-0000-0000-0000000000A2', '00000000-0000-0000-0000-000000000001', 'Tarjeta Débito',      0,     0,  0),
    ('00000000-0000-0000-0000-0000000000A3', '00000000-0000-0000-0000-000000000001', 'Tarjeta Crédito',     0,     0, 10);

-- =============================================================================
-- 12. TIPOS DE OPERACIÓN (catálogo global)
-- =============================================================================
INSERT INTO public.tipo_operacion (id, nombre)
VALUES
    ('00000000-0000-0000-0000-0000000000B0', 'Compra'),
    ('00000000-0000-0000-0000-0000000000B1', 'Venta'),
    ('00000000-0000-0000-0000-0000000000B2', 'Traslado'),
    ('00000000-0000-0000-0000-0000000000B3', 'Movimiento');

-- =============================================================================
-- 13. USUARIO_SUCURSAL
-- =============================================================================
-- Matias Admin en ambas sucursales con rol Administrador
INSERT INTO public.usuario_sucursal (id, usuario_id, sucursal_id, id_rol)
VALUES
    ('00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000030'),
    ('00000000-0000-0000-0000-0000000000C1', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000030');

-- Nacho: vendedor en Casa Central
INSERT INTO public.usuario_sucursal (id, usuario_id, sucursal_id, id_rol)
VALUES
    ('00000000-0000-0000-0000-0000000000C2', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000031');

-- Donatella: vendedora en Sucursal Norte
INSERT INTO public.usuario_sucursal (id, usuario_id, sucursal_id, id_rol)
VALUES
    ('00000000-0000-0000-0000-0000000000C3', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000031');

-- =============================================================================
-- 14. OPERACIONES
-- =============================================================================

-- Operación D0: COMPRA en Casa Central
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha)
VALUES (
    '00000000-0000-0000-0000-0000000000D0',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C0',   -- Matias en Casa Central
    '00000000-0000-0000-0000-0000000000B0',   -- Compra
    NOW() - INTERVAL '5 days'
);

-- Detalle de la compra: 10 cámaras + 2 DVR
INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-000000000090', 10, 21, 58800, 28000, 28000),
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-000000000091',  2, 21, 17640, 42000, 42000);

-- Extensión COMPRA
INSERT INTO public.compra (operacion_id, proveedor_id, numero_remito, numero_factura, subtotal_ars, total_ars)
VALUES (
    '00000000-0000-0000-0000-0000000000D0',
    '00000000-0000-0000-0000-000000000050',  -- Dahua
    'R-2026-001',
    'A-0001-00012345',
    364000,
    440440
);

-- Distribución de pago de la compra
INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, monto_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-0000000000A1', 100, 440440);

-- Operación D1: VENTA en Casa Central
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha)
VALUES (
    '00000000-0000-0000-0000-0000000000D1',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C2',   -- Nacho en Casa Central
    '00000000-0000-0000-0000-0000000000B1',   -- Venta
    NOW() - INTERVAL '2 days'
);

-- Detalle de la venta: 3 cámaras + 1 disco
INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-000000000090', 3, 21, 28350, 45000, 28000),
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-000000000092', 1, 21,  7350, 35000, 22000);

-- Extensión VENTA
INSERT INTO public.venta (operacion_id, numero_comprobante, subtotal_ars, total_ars)
VALUES (
    '00000000-0000-0000-0000-0000000000D1',
    'B-0001-00000234',
    170000,
    205700
);

-- Distribución de pago: 60% efectivo, 40% transferencia
INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, monto_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-0000000000A0',  60, 123420),
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-0000000000A1',  40,  82280);

-- =============================================================================
-- 15. PEDIDO DE REPOSICIÓN
-- =============================================================================
INSERT INTO public.pedido_reposicion (id, tenant_id, producto_sucursal_id, usuario_id, proveedor_id, cantidad, estado, origen)
VALUES (
    '00000000-0000-0000-0000-0000000000E0',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000098',   -- Sensor (Sucursal Norte, sin stock)
    '00000000-0000-0000-0000-000000000012',   -- Donatella
    '00000000-0000-0000-0000-000000000050',   -- Dahua
    20,
    'pendiente',
    'manual'
);
