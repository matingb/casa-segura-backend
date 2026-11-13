-- =============================================================================
-- Script base en SQL: Asignar un usuario a un tenant y tablas obligatorias
-- =============================================================================
-- SIN VALORES POR DEFECTO: Todos los campos deben definirse explícitamente.
-- Ejecutable directamente desde el SQL Editor de Supabase o cliente PostgreSQL.
-- =============================================================================

DO $$
DECLARE
  -- ===========================================================================
  -- 1. PARÁMETROS OBLIGATORIOS (DEBEN COMPLETARSE ANTES DE EJECUTAR)
  -- ===========================================================================
  v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001'; -- ID exacto del tenant
  v_email       TEXT := 'carlos@casasegura.com';                -- Email del usuario
  v_nombre      TEXT := 'Carlos Gómez';                          -- Nombre completo
  v_sucursal_id UUID := '00000000-0000-0000-0000-000000000020'; -- ID exacto de la sucursal del tenant
  v_rol_nombre  TEXT := 'Vendedor';                              -- Nombre exacto del rol en ese tenant
  v_password    TEXT := 'MiClaveSegura123!';                     -- Obligatorio si el usuario no existe en auth.users

  -- Variables internas
  v_auth_id     UUID;
  v_usuario_id  UUID;
  v_rol_id      UUID;
  v_us_id       UUID;
BEGIN
  -- Validaciones estrictas de entrada (sin defaults permitidos)
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Parámetro obligatorio faltante: v_tenant_id no puede ser NULL.';
  END IF;
  IF v_email IS NULL OR trim(v_email) = '' THEN
    RAISE EXCEPTION 'Parámetro obligatorio faltante: v_email no puede estar vacío.';
  END IF;
  IF v_nombre IS NULL OR trim(v_nombre) = '' THEN
    RAISE EXCEPTION 'Parámetro obligatorio faltante: v_nombre no puede estar vacío.';
  END IF;
  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Parámetro obligatorio faltante: v_sucursal_id no puede ser NULL. Debe indicarse la sucursal asignada.';
  END IF;
  IF v_rol_nombre IS NULL OR trim(v_rol_nombre) = '' THEN
    RAISE EXCEPTION 'Parámetro obligatorio faltante: v_rol_nombre no puede estar vacío. Debe indicarse el rol.';
  END IF;

  -- 1. Validar que el tenant exista
  IF NOT EXISTS (SELECT 1 FROM public.tenant WHERE id = v_tenant_id) THEN
    RAISE EXCEPTION 'El tenant con id % no existe en public.tenant.', v_tenant_id;
  END IF;

  -- 2. Validar que la sucursal exista y pertenezca al tenant indicado
  IF NOT EXISTS (SELECT 1 FROM public.sucursal WHERE id = v_sucursal_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'La sucursal % no existe o no pertenece al tenant %.', v_sucursal_id, v_tenant_id;
  END IF;

  -- 3. Validar que el rol exista y pertenezca al tenant indicado
  SELECT id INTO v_rol_id 
  FROM public.rol 
  WHERE tenant_id = v_tenant_id AND lower(nombre) = lower(v_rol_nombre)
  LIMIT 1;

  IF v_rol_id IS NULL THEN
    RAISE EXCEPTION 'El rol "%" no existe en el tenant %. Debe crearse en public.rol primero.', v_rol_nombre, v_tenant_id;
  END IF;

  -- 4. TABLA auth.users (Supabase Auth)
  -- Busca si ya existe la cuenta por email; si no existe, la crea con v_password.
  SELECT id INTO v_auth_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_auth_id IS NULL THEN
    IF v_password IS NULL OR trim(v_password) = '' THEN
      RAISE EXCEPTION 'El usuario con email % no existe en auth.users. Debe proveer v_password para crearlo.', v_email;
    END IF;

    v_auth_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', v_nombre),
      now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_auth_id,
      v_auth_id::text,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
      'email', now(), now(), now()
    );
    RAISE NOTICE 'Usuario creado exitosamente en auth.users con ID: %', v_auth_id;
  ELSE
    RAISE NOTICE 'Usuario existente encontrado en auth.users con ID: %', v_auth_id;
  END IF;

  -- 5. TABLA public.usuario
  -- Vincula la cuenta de auth con el tenant (el email se obtiene por join a auth.users)
  SELECT id INTO v_usuario_id 
  FROM public.usuario 
  WHERE tenant_id = v_tenant_id AND auth_id = v_auth_id;

  IF v_usuario_id IS NULL THEN
    INSERT INTO public.usuario (id, tenant_id, auth_id, nombre, activo)
    VALUES (gen_random_uuid(), v_tenant_id, v_auth_id, v_nombre, TRUE)
    RETURNING id INTO v_usuario_id;
    RAISE NOTICE 'Registro insertado en public.usuario con ID: %', v_usuario_id;
  ELSE
    UPDATE public.usuario 
    SET nombre = v_nombre, activo = TRUE, updated_at = now()
    WHERE id = v_usuario_id;
    RAISE NOTICE 'Registro en public.usuario actualizado con ID: %', v_usuario_id;
  END IF;

  -- 6. TABLA public.usuario_sucursal (OBLIGATORIA)
  -- FKs compuestas aseguran que usuario, sucursal y rol compartan tenant_id
  INSERT INTO public.usuario_sucursal (usuario_id, sucursal_id, tenant_id, id_rol, activo)
  VALUES (v_usuario_id, v_sucursal_id, v_tenant_id, v_rol_id, TRUE)
  ON CONFLICT (usuario_id, sucursal_id) 
  DO UPDATE SET
    id_rol = EXCLUDED.id_rol,
    tenant_id = EXCLUDED.tenant_id,
    activo = TRUE
  RETURNING id INTO v_us_id;

  RAISE NOTICE 'Asignación completada exitosamente en public.usuario_sucursal con ID: %', v_us_id;
END $$;
