-- Activar pgcrypto si no estuviera activada (requerido para la función crypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Crear el Tenant
INSERT INTO public.tenant (id, nombre_empresa)
VALUES ('00000000-0000-0000-0000-000000000001', 'Dev Tenant');

-- 2. Crear usuario en auth.users (Supabase Auth)
-- Reemplaza la contraseña usando crypt con salt para que el login funcione correctamente
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'garzangb@gmail.com',
    crypt('12345678', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
);

-- Crear la identidad asociada en auth.identities
INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000002', 'garzangb@gmail.com')::jsonb,
    'email',
    now(),
    now(),
    now()
);

-- Usuario 2: nachoromero84@hotmail.com
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'nachoromero84@hotmail.com',
    crypt('12345678', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000004',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000004', 'nachoromero84@hotmail.com')::jsonb,
    'email', now(), now(), now()
);

-- Usuario 3: fragassidonatella1@gmail.com
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'fragassidonatella1@gmail.com',
    crypt('12345678', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now()
);

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
    uuid_generate_v4(),
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000005',
    format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000005', 'fragassidonatella1@gmail.com')::jsonb,
    'email', now(), now(), now()
);

-- 3. Crear registros en public.usuario mapeados al tenant
INSERT INTO public.usuario (id, tenant_id, auth_id, nombre)
VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Usuario Dev'),
    ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Nacho Romero'),
    ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Donatella Fragassi');

-- 4. Crear 5 Productos asociados al Tenant
INSERT INTO public.producto (tenant_id, codigo, nombre, marca, modelo, precio_venta)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'PROD-001', 'Cámara de Seguridad Exterior 1080p', 'Dahua', 'DH-IPC-HFW', 45000),
    ('00000000-0000-0000-0000-000000000001', 'PROD-002', 'DVR 4 Canales Inteligente', 'Hikvision', 'DS-7204', 62000),
    ('00000000-0000-0000-0000-000000000001', 'PROD-003', 'Disco Rígido 1TB Especial Video', 'Western Digital', 'WD10PURZ', 35000),
    ('00000000-0000-0000-0000-000000000001', 'PROD-004', 'Sensor de Movimiento Infrarrojo PIR', 'DSC', 'LC-100-PI', 12000),
    ('00000000-0000-0000-0000-000000000001', 'PROD-005', 'Sirena Interior Alto Impacto 110dB', 'Alonso', 'MP-100', 8500);
