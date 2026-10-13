-- =============================================================================
-- CasaSegura — Seed completo (cubre todas las entidades del DER)
-- =============================================================================
-- Corre después de todas las migraciones (`supabase db reset`). Los backfills
-- de las migraciones no alcanzan a estos datos, así que cada INSERT carga
-- explícitamente las columnas que agregaron: moneda de referencia de precios y
-- costos, estado financiero, impacto de stock, fecha efectiva de pagos, etc.

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
--  Tipos:               00000000-0000-0000-0000-000000000060  (Videovigilancia)
--                       00000000-0000-0000-0000-000000000061  (Alarmas y Sensores)
--  Subtipos:            00000000-0000-0000-0000-000000000070..0073
--  Productos:           00000000-0000-0000-0000-000000000080..0084
--  Prod Sucursal:       00000000-0000-0000-0000-000000000090..0099  (5 prods x 2 suc)
--  Cuentas financieras: 00000000-0000-0000-0000-0000000000A0..00A3
--  Tipo Operacion:      00000000-0000-0000-0000-0000000000B0  (Compra)
--                       00000000-0000-0000-0000-0000000000B1  (Venta)
--                       00000000-0000-0000-0000-0000000000B2  (Traslado)
--                       00000000-0000-0000-0000-0000000000B3  (Movimiento)
--  Usuario_Sucursal:    00000000-0000-0000-0000-0000000000C0..C3
--  Operaciones:         00000000-0000-0000-0000-0000000000D0  (compra saldada)
--                       00000000-0000-0000-0000-0000000000D1  (venta saldada)
--                       00000000-0000-0000-0000-0000000000D2  (venta sin cobrar ni entregar)
--                       00000000-0000-0000-0000-0000000000D3  (compra con pago y recepción parciales)
--                       00000000-0000-0000-0000-0000000000D4  (traslado con flete)
--                       00000000-0000-0000-0000-0000000000D5  (movimiento: egreso)
--                       00000000-0000-0000-0000-0000000000D6  (movimiento: ingreso)
--                       00000000-0000-0000-0000-0000000000D7  (venta cancelada)
--  Pedido Reposicion:   00000000-0000-0000-0000-0000000000E0
--  Regiones:            00000000-0000-0000-0000-000000000100..0105
--  Clientes:            00000000-0000-0000-0000-000000000110..0113

-- =============================================================================
-- 1. TENANT
-- =============================================================================
-- La cotización se carga en la sección 3b, una vez que existe el usuario que la
-- actualizó.
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
-- 3b. COTIZACIÓN DE REFERENCIA (CAS-54)
-- =============================================================================
-- Valor manual del dólar para toda la empresa, cargado por el administrador.
-- Es la única fuente del tipo de cambio del seed: la sección 17 deriva de acá
-- los equivalentes ARS/USD de todos los precios y costos del catálogo, y las
-- operaciones generadas en la sección 16 lo usan para valuar en ARS.
UPDATE public.tenant
SET cotizacion_usd_ars         = 1450.000000,
    cotizacion_actualizada_at  = NOW(),
    cotizacion_actualizada_por = '00000000-0000-0000-0000-000000000010',
    cotizacion_version         = 1
WHERE id = '00000000-0000-0000-0000-000000000001';

-- =============================================================================
-- 4. SUCURSALES
-- =============================================================================
-- valor_dolar queda en NULL: el dólar por sucursal fue reemplazado por la
-- cotización de empresa y solo se conserva para datos heredados.
-- descuento: nivel 1 de la cascada de la lista de precios.
INSERT INTO public.sucursal (id, tenant_id, nombre, es_central, valor_dolar, descuento, activo)
VALUES
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Casa Central',    TRUE,  NULL, NULL, TRUE),
    ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', 'Sucursal Norte',  FALSE, NULL, 2.00, TRUE);

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

-- La migración CAS-54 puede haber creado este permiso antes de ejecutar el seed.
INSERT INTO public.permiso (nombre)
VALUES ('cotizacion.actualizar')
ON CONFLICT (nombre) DO NOTHING;

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

-- Habilita al usuario administrador del seed para configurar el valor del USD.
INSERT INTO public.permiso_rol (id_rol, id_permiso)
SELECT '00000000-0000-0000-0000-000000000030'::uuid, p.id
FROM public.permiso p
WHERE p.nombre = 'cotizacion.actualizar'
ON CONFLICT DO NOTHING;

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
-- 8. TIPOS Y SUBTIPOS DE PRODUCTO (con descuentos por categoría)
-- =============================================================================
-- Nivel 2 de la cascada. NULL = no definido (hereda); 0 = descuento explícito
-- del 0%. Lo más específico gana: excepción de subtipo en la sucursal > general
-- del subtipo > excepción de categoría en la sucursal > general de la categoría.
INSERT INTO public.tipo (id, tenant_id, nombre, descuento_general)
VALUES
    ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000001', 'Videovigilancia',    5.00),
    ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000001', 'Alarmas y Sensores', NULL);

INSERT INTO public.subtipo (id, tipo_id, nombre, descuento_general)
VALUES
    ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000060', 'Cámaras Exterior',       NULL),  -- hereda el 5% de la categoría
    ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000060', 'DVR / NVR',              8.00),  -- pisa el de la categoría
    ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000061', 'Sensores de Movimiento', NULL),
    ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000061', 'Sirenas',                0.00);  -- 0 explícito: no toma la excepción de su categoría

-- Excepciones por sucursal
INSERT INTO public.descuento_categoria_sucursal (tipo_id, subtipo_id, sucursal_id, porcentaje)
VALUES
    ('00000000-0000-0000-0000-000000000061', NULL, '00000000-0000-0000-0000-000000000021', 10.00),  -- Alarmas y Sensores en Sucursal Norte
    (NULL, '00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000020',  3.00);  -- Cámaras Exterior en Casa Central

-- =============================================================================
-- 9. PRODUCTOS (ficha general)
-- =============================================================================
INSERT INTO public.producto (
    id, tenant_id, subtipo_id, codigo, codigo_barra_proveedor, nombre, marca, modelo, color, presentacion,
    alto, ancho, profundidad, peso_unitario, unidad_alto, unidad_ancho, unidad_profundidad, unidad_peso_unitario,
    descripcion, activo
)
VALUES
    ('00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000070', 'PROD-001', '6923172512345', 'Cámara Exterior 1080p',         'Dahua',           'DH-IPC-HFW2831T', 'Blanco', 'Unidad',
        8.50, 8.50, 22.00, 650.00, 'cm', 'cm', 'cm', 'g',
        'Cámara IP exterior resolución 1080p con IR 30m', TRUE),
    ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000071', 'PROD-002', '6954273698765', 'DVR 4 Canales 4K',              'Hikvision',       'DS-7204HUHI-K1',  'Negro',  'Unidad',
        4.50, 26.00, 22.00, 1.10, 'cm', 'cm', 'cm', 'kg',
        'DVR TurboHD 4 canales resolución 4K', TRUE),
    ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000071', 'PROD-003', '0718037855432', 'Disco Rígido 2TB Purple',       'Western Digital', 'WD20PURZ',        'Violeta','Unidad',
        26.10, 101.60, 147.00, 450.00, 'mm', 'mm', 'mm', 'g',
        'HDD especial para videovigilancia 24/7', TRUE),
    ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000072', 'PROD-004', NULL,            'Sensor de Movimiento PIR Dual', 'DSC',             'LC-100-PI',       'Blanco', 'Unidad',
        11.00, 6.00, 4.50, 95.00, 'cm', 'cm', 'cm', 'g',
        'Detector dual PIR cobertura 12m x 90°', TRUE),
    ('00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000073', 'PROD-005', NULL,            'Sirena Interior 110dB',         'Alonso',          'MP-100',          'Blanco', 'Caja x 1',
        10.00, 10.00, 6.00, 180.00, 'cm', 'cm', 'cm', 'g',
        'Sirena interior alto impacto 110dB', TRUE);

-- =============================================================================
-- 9b. PRECIO Y COSTO BASE DE LOS PRODUCTOS
-- =============================================================================
-- Referencia general, independiente de la sucursal (es el valor inicial al
-- habilitar el producto en una sucursal). Cada importe se carga una sola vez
-- en su moneda de referencia; el equivalente en la otra moneda lo completa la
-- sección 17 con la cotización de la empresa.
-- Los equipos importados cotizan en USD y los de fabricación nacional en ARS.
-- El disco rígido muestra que precio y costo pueden tener monedas distintas.
-- descuento_base: nivel 3 de la cascada, para todas las sucursales.
UPDATE public.producto p
SET moneda_precio_base           = v.moneda_precio,
    precio_base                  = CASE WHEN v.moneda_precio = 'ARS' THEN v.precio END,
    precio_base_usd              = CASE WHEN v.moneda_precio = 'USD' THEN v.precio END,
    moneda_costo_reposicion_base = v.moneda_costo,
    costo_reposicion_base        = CASE WHEN v.moneda_costo = 'ARS' THEN v.costo END,
    costo_reposicion_base_usd    = CASE WHEN v.moneda_costo = 'USD' THEN v.costo END,
    descuento_base               = v.descuento_base
FROM (VALUES
    --  código     moneda   precio      moneda   costo      desc. base
    ('PROD-001', 'USD',      32.00,   'USD',      19.50,   NULL::DECIMAL),
    ('PROD-002', 'USD',      45.00,   'USD',      29.00,   NULL),
    ('PROD-003', 'USD',      24.00,   'ARS',   22000.00,   3.00),
    ('PROD-004', 'ARS',   12000.00,   'ARS',    7500.00,   NULL),
    ('PROD-005', 'ARS',    8500.00,   'ARS',    5000.00,   NULL)
) AS v(codigo, moneda_precio, precio, moneda_costo, costo, descuento_base)
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.codigo = v.codigo;

-- =============================================================================
-- 10. PRODUCTO_SUCURSAL (precio, costo y stock por sucursal)
-- =============================================================================
-- Igual que en el producto: solo el importe principal; la sección 17 completa
-- el equivalente. precio_referencia_confirmada = TRUE porque son precios
-- cargados con el modelo de doble moneda (no heredados de antes de CAS-54).
-- descuento: nivel 3 de la cascada; pisa el descuento_base del producto.

-- Casa Central
INSERT INTO public.producto_sucursal (
    id, producto_id, sucursal_id, habilitado,
    moneda_precio_venta, precio_venta_ars, precio_venta_usd, precio_referencia_confirmada,
    moneda_costo_reposicion, costo_reposicion, costo_reposicion_usd,
    iva, margen_minimo, descuento, stock_minimo, cantidad_disponible
)
VALUES
    ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000020', TRUE,  'USD', NULL,     32.00, TRUE, 'USD', NULL,    19.50, 21, 15, 5.00, 5,  20),
    ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000020', TRUE,  'USD', NULL,     45.00, TRUE, 'USD', NULL,    29.00, 21, 20, NULL, 3,   8),
    ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000020', TRUE,  'USD', NULL,     24.00, TRUE, 'ARS', 22000,   NULL,  21, 15, NULL, 5,  15),
    ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000020', TRUE,  'ARS', 12000,    NULL,  TRUE, 'ARS', 7500,    NULL,  21, 20, NULL, 10, 35),
    ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000020', TRUE,  'ARS', 8500,     NULL,  TRUE, 'ARS', 5000,    NULL,  21, 20, NULL, 10, 40);

-- Sucursal Norte
INSERT INTO public.producto_sucursal (
    id, producto_id, sucursal_id, habilitado,
    moneda_precio_venta, precio_venta_ars, precio_venta_usd, precio_referencia_confirmada,
    moneda_costo_reposicion, costo_reposicion, costo_reposicion_usd,
    iva, margen_minimo, descuento, stock_minimo, cantidad_disponible
)
VALUES
    ('00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-000000000021', TRUE,  'USD', NULL,     33.00, TRUE, 'USD', NULL,    19.50, 21, 15, NULL, 3,  10),
    ('00000000-0000-0000-0000-000000000096', '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000021', TRUE,  'USD', NULL,     46.00, TRUE, 'USD', NULL,    29.00, 21, 20, NULL, 2,   4),
    ('00000000-0000-0000-0000-000000000097', '00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000021', TRUE,  'USD', NULL,     25.00, TRUE, 'ARS', 22000,   NULL,  21, 15, NULL, 3,   7),
    ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000021', FALSE, 'ARS', 12000,    NULL,  TRUE, 'ARS', 7500,    NULL,  21, 20, NULL, 5,   0),
    ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000021', TRUE,  'ARS', 8800,     NULL,  TRUE, 'ARS', 5000,    NULL,  21, 20, NULL, 5,  18);

-- =============================================================================
-- 11. CUENTAS FINANCIERAS
-- =============================================================================
-- saldo_actual se recalcula en la sección 18 a partir de los pagos y cobros.
INSERT INTO public.cuenta_financiera (id, tenant_id, nombre, saldo_inicial, saldo_actual, porcentaje_extra)
VALUES
    ('00000000-0000-0000-0000-0000000000A0', '00000000-0000-0000-0000-000000000001', 'Efectivo',          500000,   500000,  0),
    ('00000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-000000000001', 'Transferencia',   15000000, 15000000,  0),
    ('00000000-0000-0000-0000-0000000000A2', '00000000-0000-0000-0000-000000000001', 'Tarjeta Débito',         0,        0,  0),
    ('00000000-0000-0000-0000-0000000000A3', '00000000-0000-0000-0000-000000000001', 'Tarjeta Crédito',        0,        0, 10);

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
-- Importes ARS históricos, valuados a la cotización de referencia del seed.
-- Precios unitarios netos de IVA; total = subtotal + IVA.
-- estado_financiero: compras y ventas lo calculan contra sus pagos/cobros;
-- traslados y movimientos no lo usan (NULL).
-- cantidad_impactada_stock: compras y ventas registran cuánto ya movió el
-- stock físico; los traslados mueven stock al crearse y lo dejan en 0.

-- Operación D0: COMPRA en Casa Central (saldada y recibida)
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero)
VALUES (
    '00000000-0000-0000-0000-0000000000D0',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C0',   -- Matias en Casa Central
    '00000000-0000-0000-0000-0000000000B0',   -- Compra
    NOW() - INTERVAL '5 days',
    'SALDADA'
);

-- Detalle de la compra: 10 cámaras (USD 19,50) + 2 DVR (USD 29,00)
INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-000000000090', 10, 10, NOW() - INTERVAL '5 days', 21, 59377.50, 28275.00, 28275.00),
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-000000000091',  2,  2, NOW() - INTERVAL '5 days', 21, 17661.00, 42050.00, 42050.00);

-- Extensión COMPRA
INSERT INTO public.compra (operacion_id, proveedor_id, numero_remito, numero_factura, subtotal_ars, total_ars)
VALUES (
    '00000000-0000-0000-0000-0000000000D0',
    '00000000-0000-0000-0000-000000000050',  -- Dahua
    'R-2026-001',
    'A-0001-00012345',
    366850.00,
    443888.50
);

-- Distribución de pago de la compra
INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D0', '00000000-0000-0000-0000-0000000000A1', 100, 0, 443888.50, NOW() - INTERVAL '5 days');

-- Operación D1: VENTA en Casa Central (cobrada y entregada)
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero)
VALUES (
    '00000000-0000-0000-0000-0000000000D1',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C2',   -- Nacho en Casa Central
    '00000000-0000-0000-0000-0000000000B1',   -- Venta
    NOW() - INTERVAL '2 days',
    'SALDADA'
);

-- Detalle de la venta: 3 cámaras + 1 disco
INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-000000000090', 3, 3, NOW() - INTERVAL '2 days', 21, 29232.00, 46400.00, 28275.00),
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-000000000092', 1, 1, NOW() - INTERVAL '2 days', 21,  7308.00, 34800.00, 22000.00);

-- Extensión VENTA
INSERT INTO public.venta (operacion_id, numero_comprobante, subtotal_ars, total_ars)
VALUES (
    '00000000-0000-0000-0000-0000000000D1',
    'B-0001-00000234',
    174000.00,
    210540.00
);

-- Distribución de cobro: 60% efectivo, 40% transferencia
INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-0000000000A0',  60, 0, 126324.00, NOW() - INTERVAL '2 days'),
    ('00000000-0000-0000-0000-0000000000D1', '00000000-0000-0000-0000-0000000000A1',  40, 0,  84216.00, NOW() - INTERVAL '2 days');

-- Operación D2: VENTA en Casa Central sin cobrar ni entregar (CAS-45 / CAS-48)
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero)
VALUES (
    '00000000-0000-0000-0000-0000000000D2',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C2',   -- Nacho en Casa Central
    '00000000-0000-0000-0000-0000000000B1',   -- Venta
    NOW() - INTERVAL '1 day',
    'PENDIENTE'
);

INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D2', '00000000-0000-0000-0000-000000000093', 4, 0, NULL, 21, 10080.00, 12000.00, 7500.00);

INSERT INTO public.venta (operacion_id, numero_comprobante, subtotal_ars, total_ars)
VALUES ('00000000-0000-0000-0000-0000000000D2', 'B-0001-00000235', 48000.00, 58080.00);

-- Operación D3: COMPRA en Sucursal Norte con anticipo y recepción parcial (6 de 10)
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero)
VALUES (
    '00000000-0000-0000-0000-0000000000D3',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C1',   -- Matias en Sucursal Norte
    '00000000-0000-0000-0000-0000000000B0',   -- Compra
    NOW() - INTERVAL '3 days',
    'PARCIAL'
);

INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D3', '00000000-0000-0000-0000-000000000096', 10, 6, NOW() - INTERVAL '2 days', 21, 88305.00, 42050.00, 42050.00);

INSERT INTO public.compra (operacion_id, proveedor_id, numero_remito, numero_factura, subtotal_ars, total_ars)
VALUES (
    '00000000-0000-0000-0000-0000000000D3',
    '00000000-0000-0000-0000-000000000051',  -- Hikvision
    'R-2026-101',
    'A-0002-00000456',
    420500.00,
    508805.00
);

INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva, observacion)
VALUES
    ('00000000-0000-0000-0000-0000000000D3', '00000000-0000-0000-0000-0000000000A1', 49.13, 0, 250000.00, NOW() - INTERVAL '3 days', 'Anticipo al proveedor');

-- Operación D4: TRASLADO de Casa Central a Sucursal Norte, con flete pagado en efectivo
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha)
VALUES (
    '00000000-0000-0000-0000-0000000000D4',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C0',   -- Matias en Casa Central (origen)
    '00000000-0000-0000-0000-0000000000B2',   -- Traslado
    NOW() - INTERVAL '6 days'
);

INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock)
VALUES
    ('00000000-0000-0000-0000-0000000000D4', '00000000-0000-0000-0000-000000000094', 5, 0);

INSERT INTO public.traslado (operacion_id, sucursal_destino_id, costo_flete_ars)
VALUES ('00000000-0000-0000-0000-0000000000D4', '00000000-0000-0000-0000-000000000021', 3500.00);

INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D4', '00000000-0000-0000-0000-0000000000A0', 100, 0, 3500.00, NOW() - INTERVAL '6 days');

-- Operación D5: MOVIMIENTO de egreso (gasto fijo)
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha)
VALUES (
    '00000000-0000-0000-0000-0000000000D5',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C0',   -- Matias en Casa Central
    '00000000-0000-0000-0000-0000000000B3',   -- Movimiento
    NOW() - INTERVAL '10 days'
);

INSERT INTO public.movimiento (operacion_id, tipo, descripcion, monto_ars)
VALUES ('00000000-0000-0000-0000-0000000000D5', 'egreso', 'Pago de alquiler del local', 350000.00);

INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D5', '00000000-0000-0000-0000-0000000000A1', 100, 0, 350000.00, NOW() - INTERVAL '10 days');

-- Operación D6: MOVIMIENTO de ingreso
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha)
VALUES (
    '00000000-0000-0000-0000-0000000000D6',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C3',   -- Donatella en Sucursal Norte
    '00000000-0000-0000-0000-0000000000B3',   -- Movimiento
    NOW() - INTERVAL '7 days'
);

INSERT INTO public.movimiento (operacion_id, tipo, descripcion, monto_ars)
VALUES ('00000000-0000-0000-0000-0000000000D6', 'ingreso', 'Cobro de servicio técnico', 45000.00);

INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D6', '00000000-0000-0000-0000-0000000000A0', 100, 0, 45000.00, NOW() - INTERVAL '7 days');

-- Operación D7: VENTA cancelada (CAS-39). Al cancelar se revierten stock y
-- saldo, pero el detalle y el cobro quedan como historial.
INSERT INTO public.operacion (id, tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero, cancelled_at, cancelled_by_usuario_sucursal_id)
VALUES (
    '00000000-0000-0000-0000-0000000000D7',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000C2',   -- Nacho en Casa Central
    '00000000-0000-0000-0000-0000000000B1',   -- Venta
    NOW() - INTERVAL '4 days',
    'SALDADA',
    NOW() - INTERVAL '4 days' + INTERVAL '2 hours',
    '00000000-0000-0000-0000-0000000000C0'    -- la canceló Matias
);

INSERT INTO public.operacion_detalle (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars)
VALUES
    ('00000000-0000-0000-0000-0000000000D7', '00000000-0000-0000-0000-000000000094', 1, 1, NOW() - INTERVAL '4 days', 21, 1785.00, 8500.00, 5000.00);

INSERT INTO public.venta (operacion_id, numero_comprobante, subtotal_ars, total_ars)
VALUES ('00000000-0000-0000-0000-0000000000D7', 'B-0001-00000233', 8500.00, 10285.00);

INSERT INTO public.operacion_cuenta (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva)
VALUES
    ('00000000-0000-0000-0000-0000000000D7', '00000000-0000-0000-0000-0000000000A0', 100, 0, 10285.00, NOW() - INTERVAL '4 days');

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

-- =============================================================================
-- 15b. REGIONES Y CLIENTES
-- =============================================================================
-- Regiones comerciales de cada sucursal (nivel 4a de la cascada).
INSERT INTO public.region (id, tenant_id, sucursal_id, nombre, descuento, activo)
VALUES
    ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'CABA',       2.00, TRUE),
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Zona Sur',   3.00, TRUE),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Zona Oeste', 1.50, TRUE),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'Zona Norte', 2.00, TRUE),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'Zona Rural', 5.00, TRUE),
    ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'Escobar',    4.00, FALSE);

-- descuento_porcentaje: descuento habitual del cliente (nivel 4d).
INSERT INTO public.cliente (
    id, tenant_id, nombre, tipo_cliente, razon_social, nombre_contacto,
    tipo_documento, nro_documento, condicion_iva, email, telefono,
    direccion, localidad, provincia, codigo_postal, descuento_porcentaje, observaciones, activo
)
VALUES
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000001',
        'Seguridad Integral del Sur', 'empresa', 'Seguridad Integral del Sur S.A.', 'Laura Méndez',
        'CUIT', '30-70987654-3', 'Responsable Inscripto', 'compras@segintegralsur.com.ar', '011-4201-3344',
        'Av. Mitre 1450', 'Avellaneda', 'Buenos Aires', '1870', 5.00, 'Instalador mayorista. Compra todos los meses.', TRUE),
    ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000001',
        'Juan Pérez', 'persona', NULL, NULL,
        'DNI', '28456789', 'Consumidor Final', 'juan.perez@gmail.com', '11-5566-7788',
        'Calle 12 345', 'La Plata', 'Buenos Aires', '1900', NULL, NULL, TRUE),
    ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000001',
        'Instaladora Norte', 'empresa', 'Instaladora Norte S.R.L.', 'Martín Ruiz',
        'CUIT', '30-71555222-8', 'Responsable Inscripto', 'martin@instaladoranorte.com.ar', '0230-444-1122',
        'Ruta 8 km 50', 'Pilar', 'Buenos Aires', '1629', 3.00, NULL, TRUE),
    ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000001',
        'Carlos Gómez', 'persona', NULL, NULL,
        'DNI', '30111222', 'Monotributo', NULL, '11-4433-2211',
        NULL, 'Quilmes', 'Buenos Aires', NULL, NULL, 'Dado de baja: dejó de operar.', FALSE);

-- Sucursales que atienden a cada cliente (todo cliente tiene al menos una).
INSERT INTO public.cliente_sucursal (cliente_id, sucursal_id)
VALUES
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000021'),
    ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000020'),
    ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000021'),
    ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000020');

-- Región del cliente en cada sucursal que lo atiende (Juan Pérez no tiene).
INSERT INTO public.cliente_region (cliente_id, sucursal_id, region_id)
VALUES
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000101'),  -- Zona Sur
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000103'),  -- Zona Norte
    ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000104');  -- Zona Rural

-- Descuentos del cliente por categoría / subcategoría (nivel 4b).
INSERT INTO public.cliente_descuento_categoria (cliente_id, tipo_id, subtipo_id, porcentaje, nota)
VALUES
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000060', NULL, 4.00, 'Acuerdo anual de videovigilancia'),
    ('00000000-0000-0000-0000-000000000110', NULL, '00000000-0000-0000-0000-000000000073', 2.00, NULL),
    ('00000000-0000-0000-0000-000000000112', NULL, '00000000-0000-0000-0000-000000000072', 7.00, 'Promoción para instaladores');

-- Descuentos del cliente por producto (nivel 4c). El del DVR, sumado al resto
-- de la cascada en Casa Central, supera el margen mínimo: sirve para ver el tope.
INSERT INTO public.cliente_descuento_producto (cliente_id, producto_id, porcentaje, nota)
VALUES
    ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000081', 6.00, 'Precio especial por volumen'),
    ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000084', 10.00, 'Proyecto barrio cerrado');

-- =============================================================================
-- 16. GENERACIÓN MASIVA DE DATOS PARA PRUEBAS DE PAGINACIÓN Y SCROLL (> 50 items)
-- =============================================================================
DO $$
DECLARE
    v_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    v_subtipo_ext UUID := '00000000-0000-0000-0000-000000000070'; -- Cámaras Exterior
    v_subtipo_dvr UUID := '00000000-0000-0000-0000-000000000071'; -- DVR / NVR
    v_subtipo_sen UUID := '00000000-0000-0000-0000-000000000072'; -- Sensores
    v_subtipo_sir UUID := '00000000-0000-0000-0000-000000000073'; -- Sirenas

    v_suc_central UUID := '00000000-0000-0000-0000-000000000020';
    v_suc_norte   UUID := '00000000-0000-0000-0000-000000000021';

    v_prov_dahua  UUID := '00000000-0000-0000-0000-000000000050';
    v_prov_hik    UUID := '00000000-0000-0000-0000-000000000051';
    v_prov_tech   UUID := '00000000-0000-0000-0000-000000000052';

    v_cta_efectivo UUID := '00000000-0000-0000-0000-0000000000A0';
    v_cta_transf   UUID := '00000000-0000-0000-0000-0000000000A1';

    v_tipo_compra  UUID := '00000000-0000-0000-0000-0000000000B0';
    v_tipo_venta   UUID := '00000000-0000-0000-0000-0000000000B1';

    v_us_matias_c  UUID := '00000000-0000-0000-0000-0000000000C0';
    v_us_nacho_c   UUID := '00000000-0000-0000-0000-0000000000C2';
    v_us_dona_n    UUID := '00000000-0000-0000-0000-0000000000C3';
    v_user_dona    UUID := '00000000-0000-0000-0000-000000000012';

    v_cotizacion NUMERIC;
    v_prod_id UUID;
    v_ps_central_id UUID;
    v_ps_norte_id UUID;
    v_op_id UUID;
    v_fecha TIMESTAMPTZ;
    v_i INT;
    v_subtipo UUID;
    v_marca TEXT;
    v_nombre TEXT;
    v_modelo TEXT;
    v_moneda TEXT;
    -- Importes principales, en la moneda de referencia del producto
    v_costo NUMERIC;
    v_precio NUMERIC;
    v_precio_norte NUMERIC;
    -- Equivalentes ARS para las operaciones históricas
    v_costo_ars NUMERIC;
    v_precio_venta_ars NUMERIC;
    v_venta_en_norte BOOLEAN;
    v_subtotal NUMERIC;
    v_total NUMERIC;
    v_subtipos UUID[] := ARRAY[v_subtipo_ext, v_subtipo_dvr, v_subtipo_sen, v_subtipo_sir];
    v_marcas TEXT[] := ARRAY['Dahua', 'Hikvision', 'DSC', 'Alonso', 'Ezviz', 'Intelbras', 'Ubiquiti', 'Western Digital', 'TP-Link', 'Seagate'];
    v_nombres TEXT[] := ARRAY[
        'Cámara Domo HD', 'Cámara Bullet 4K', 'Cámara PTZ 360', 'Cámara Solar Wi-Fi',
        'NVR 8 Canales', 'NVR 16 Canales PoE', 'DVR 8 Canales HD', 'DVR 16 Canales 4K',
        'Sensor Movimiento Inalámbrico', 'Sensor Magnético Puerta', 'Barrera Infrarroja 60m', 'Sensor de Humo Óptico',
        'Sirena Exterior con Flash', 'Sirena Inalámbrica 120dB', 'Teclado LCD Alarma', 'Central de Alarma 8 Zonas',
        'Fuente Regulada 12V 5A', 'Balun Pasivo HD', 'Bobina Cable UTP Cat6 305m', 'Conector BNC con Tornillo'
    ];
BEGIN
    SELECT cotizacion_usd_ars INTO v_cotizacion FROM public.tenant WHERE id = v_tenant_id;

    -- Generar 70 productos adicionales (PROD-006 a PROD-075)
    FOR v_i IN 6..75 LOOP
        v_subtipo := v_subtipos[1 + ((v_i - 1) % 4)];
        v_marca := v_marcas[1 + ((v_i - 1) % 10)];
        v_nombre := v_nombres[1 + ((v_i - 1) % 20)] || ' Mod. ' || v_i;
        v_modelo := 'MD-' || (1000 + v_i);
        v_fecha := NOW() - (v_i || ' days')::INTERVAL;

        -- Cámaras y grabadores (importados) se cotizan en USD; sensores y sirenas en ARS.
        IF v_subtipo IN (v_subtipo_ext, v_subtipo_dvr) THEN
            v_moneda := 'USD';
            v_costo := 4 + (v_i * 0.6);
        ELSE
            v_moneda := 'ARS';
            v_costo := 5000 + (v_i * 850);
        END IF;
        v_precio := ROUND(v_costo * 1.55, 2);
        v_precio_norte := ROUND(v_precio * 1.05, 2);
        v_costo_ars := CASE WHEN v_moneda = 'USD' THEN ROUND(v_costo * v_cotizacion, 2) ELSE v_costo END;

        INSERT INTO public.producto (
            tenant_id, subtipo_id, codigo, nombre, marca, modelo, descripcion, activo,
            moneda_precio_base, precio_base, precio_base_usd,
            moneda_costo_reposicion_base, costo_reposicion_base, costo_reposicion_base_usd,
            descuento_base
        ) VALUES (
            v_tenant_id,
            v_subtipo,
            'PROD-' || LPAD(v_i::TEXT, 3, '0'),
            v_nombre,
            v_marca,
            v_modelo,
            'Descripción detallada para ' || v_nombre || ' de marca ' || v_marca,
            (v_i % 7 != 0),
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_precio END,
            CASE WHEN v_moneda = 'USD' THEN v_precio END,
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_costo END,
            CASE WHEN v_moneda = 'USD' THEN v_costo END,
            CASE WHEN v_i % 10 = 0 THEN 2.00 END
        ) RETURNING id INTO v_prod_id;

        -- Stock en Casa Central
        INSERT INTO public.producto_sucursal (
            producto_id, sucursal_id, habilitado,
            moneda_precio_venta, precio_venta_ars, precio_venta_usd, precio_referencia_confirmada,
            moneda_costo_reposicion, costo_reposicion, costo_reposicion_usd,
            iva, margen_minimo, stock_minimo, cantidad_disponible, cantidad_reservada
        ) VALUES (
            v_prod_id,
            v_suc_central,
            TRUE,
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_precio END,
            CASE WHEN v_moneda = 'USD' THEN v_precio END,
            TRUE,
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_costo END,
            CASE WHEN v_moneda = 'USD' THEN v_costo END,
            21,
            20,
            5,
            (v_i * 3) % 45,
            v_i % 4
        ) RETURNING id INTO v_ps_central_id;

        -- Stock en Sucursal Norte (5% más caro)
        INSERT INTO public.producto_sucursal (
            producto_id, sucursal_id, habilitado,
            moneda_precio_venta, precio_venta_ars, precio_venta_usd, precio_referencia_confirmada,
            moneda_costo_reposicion, costo_reposicion, costo_reposicion_usd,
            iva, margen_minimo, stock_minimo, cantidad_disponible, cantidad_reservada
        ) VALUES (
            v_prod_id,
            v_suc_norte,
            TRUE,
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_precio_norte END,
            CASE WHEN v_moneda = 'USD' THEN v_precio_norte END,
            TRUE,
            v_moneda,
            CASE WHEN v_moneda = 'ARS' THEN v_costo END,
            CASE WHEN v_moneda = 'USD' THEN v_costo END,
            21,
            20,
            3,
            (v_i * 2) % 30,
            0
        ) RETURNING id INTO v_ps_norte_id;

        -- Generar pedidos de reposición asociados
        IF (v_i % 2 = 0) THEN
            INSERT INTO public.pedido_reposicion (
                tenant_id, producto_sucursal_id, usuario_id, proveedor_id, cantidad, estado, origen, fecha
            ) VALUES (
                v_tenant_id,
                CASE WHEN v_i % 4 = 0 THEN v_ps_central_id ELSE v_ps_norte_id END,
                v_user_dona,
                CASE (v_i % 3) WHEN 0 THEN v_prov_dahua WHEN 1 THEN v_prov_hik ELSE v_prov_tech END,
                10 + (v_i % 25),
                CASE (v_i % 4) WHEN 0 THEN 'pendiente' WHEN 1 THEN 'aprobado' WHEN 2 THEN 'en_camino' ELSE 'recibido' END,
                CASE WHEN v_i % 3 = 0 THEN 'automatico' ELSE 'manual' END,
                v_fecha
            );
        END IF;

        -- Generar operaciones (ventas y compras), todas saldadas y con el stock ya impactado
        IF (v_i <= 65) THEN
            IF (v_i % 2 = 1) THEN
                -- VENTA: la registra el vendedor de la sucursal de la que sale el stock
                v_venta_en_norte := (v_i % 3 = 0);
                v_precio_venta_ars := CASE WHEN v_venta_en_norte THEN v_precio_norte ELSE v_precio END;
                IF v_moneda = 'USD' THEN
                    v_precio_venta_ars := ROUND(v_precio_venta_ars * v_cotizacion, 2);
                END IF;
                v_subtotal := v_precio_venta_ars * 2;
                v_total := ROUND(v_subtotal * 1.21, 2);

                INSERT INTO public.operacion (
                    tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero
                ) VALUES (
                    v_tenant_id,
                    CASE WHEN v_venta_en_norte THEN v_us_dona_n ELSE v_us_nacho_c END,
                    v_tipo_venta,
                    v_fecha,
                    'SALDADA'
                ) RETURNING id INTO v_op_id;

                INSERT INTO public.operacion_detalle (
                    operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at,
                    alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars
                ) VALUES (
                    v_op_id,
                    CASE WHEN v_venta_en_norte THEN v_ps_norte_id ELSE v_ps_central_id END,
                    2,
                    2,
                    v_fecha,
                    21,
                    v_total - v_subtotal,
                    v_precio_venta_ars,
                    v_costo_ars
                );

                INSERT INTO public.venta (
                    operacion_id, numero_comprobante, subtotal_ars, total_ars
                ) VALUES (
                    v_op_id,
                    'B-0001-' || LPAD((1000 + v_i)::TEXT, 8, '0'),
                    v_subtotal,
                    v_total
                );

                INSERT INTO public.operacion_cuenta (
                    operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva
                ) VALUES (
                    v_op_id,
                    CASE WHEN v_i % 4 = 1 THEN v_cta_efectivo ELSE v_cta_transf END,
                    100,
                    0,
                    v_total,
                    v_fecha
                );
            ELSE
                -- COMPRA
                v_subtotal := v_costo_ars * 10;
                v_total := ROUND(v_subtotal * 1.21, 2);

                INSERT INTO public.operacion (
                    tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero
                ) VALUES (
                    v_tenant_id,
                    v_us_matias_c,
                    v_tipo_compra,
                    v_fecha,
                    'SALDADA'
                ) RETURNING id INTO v_op_id;

                INSERT INTO public.operacion_detalle (
                    operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at,
                    alicuota_iva, iva_ars, precio_unit_ars, costo_unit_ars
                ) VALUES (
                    v_op_id,
                    v_ps_central_id,
                    10,
                    10,
                    v_fecha,
                    21,
                    v_total - v_subtotal,
                    v_costo_ars,
                    v_costo_ars
                );

                INSERT INTO public.compra (
                    operacion_id, proveedor_id, numero_remito, numero_factura, subtotal_ars, total_ars
                ) VALUES (
                    v_op_id,
                    CASE (v_i % 3) WHEN 0 THEN v_prov_dahua WHEN 1 THEN v_prov_hik ELSE v_prov_tech END,
                    'R-2026-' || LPAD(v_i::TEXT, 3, '0'),
                    'A-0001-' || LPAD((10000 + v_i)::TEXT, 8, '0'),
                    v_subtotal,
                    v_total
                );

                INSERT INTO public.operacion_cuenta (
                    operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, fecha_efectiva
                ) VALUES (
                    v_op_id,
                    v_cta_transf,
                    100,
                    0,
                    v_total,
                    v_fecha
                );
            END IF;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 17. EQUIVALENTES ARS/USD DEL CATÁLOGO
-- =============================================================================
-- Replica lo que guarda el backend al cargar un precio o un costo (ver
-- columnasMonto en precio-catalogo.service.ts): la columna de la moneda de
-- referencia tiene el principal y la otra, el equivalente con la cotización
-- vigente (ARS con 2 decimales, USD con 4).
UPDATE public.producto p
SET precio_base               = CASE WHEN p.moneda_precio_base = 'USD'
                                     THEN ROUND(p.precio_base_usd * t.cotizacion_usd_ars, 2)
                                     ELSE p.precio_base END,
    precio_base_usd           = CASE WHEN p.moneda_precio_base = 'USD'
                                     THEN p.precio_base_usd
                                     ELSE ROUND(p.precio_base / t.cotizacion_usd_ars, 4) END,
    costo_reposicion_base     = CASE WHEN p.moneda_costo_reposicion_base = 'USD'
                                     THEN ROUND(p.costo_reposicion_base_usd * t.cotizacion_usd_ars, 2)
                                     ELSE p.costo_reposicion_base END,
    costo_reposicion_base_usd = CASE WHEN p.moneda_costo_reposicion_base = 'USD'
                                     THEN p.costo_reposicion_base_usd
                                     ELSE ROUND(p.costo_reposicion_base / t.cotizacion_usd_ars, 4) END
FROM public.tenant t
WHERE t.id = p.tenant_id;

UPDATE public.producto_sucursal ps
SET precio_venta_ars     = CASE WHEN ps.moneda_precio_venta = 'USD'
                                THEN ROUND(ps.precio_venta_usd * t.cotizacion_usd_ars, 2)
                                ELSE ps.precio_venta_ars END,
    precio_venta_usd     = CASE WHEN ps.moneda_precio_venta = 'USD'
                                THEN ps.precio_venta_usd
                                ELSE ROUND(ps.precio_venta_ars / t.cotizacion_usd_ars, 4) END,
    costo_reposicion     = CASE WHEN ps.moneda_costo_reposicion = 'USD'
                                THEN ROUND(ps.costo_reposicion_usd * t.cotizacion_usd_ars, 2)
                                ELSE ps.costo_reposicion END,
    costo_reposicion_usd = CASE WHEN ps.moneda_costo_reposicion = 'USD'
                                THEN ps.costo_reposicion_usd
                                ELSE ROUND(ps.costo_reposicion / t.cotizacion_usd_ars, 4) END
FROM public.producto p
JOIN public.tenant t ON t.id = p.tenant_id
WHERE p.id = ps.producto_id;

-- =============================================================================
-- 18. SALDOS DE LAS CUENTAS FINANCIERAS
-- =============================================================================
-- El backend actualiza saldo_actual con cada pago o cobro. Como el seed inserta
-- el historial directamente, se recalcula acá: saldo inicial + cobros de ventas
-- e ingresos − pagos de compras, fletes y egresos. Las operaciones canceladas
-- ya revirtieron su impacto, así que no suman.
UPDATE public.cuenta_financiera cf
SET saldo_actual = cf.saldo_inicial + COALESCE((
        SELECT SUM(CASE
                     WHEN tipo.nombre = 'Venta' OR m.tipo = 'ingreso' THEN oc.monto_ars
                     ELSE -oc.monto_ars
                   END)
        FROM public.operacion_cuenta oc
        JOIN public.operacion o         ON o.id = oc.operacion_id AND o.cancelled_at IS NULL
        JOIN public.tipo_operacion tipo ON tipo.id = o.tipo_id
        LEFT JOIN public.movimiento m   ON m.operacion_id = o.id
        WHERE oc.cuenta_financiera_id = cf.id
    ), 0)
WHERE cf.tenant_id = '00000000-0000-0000-0000-000000000001';
