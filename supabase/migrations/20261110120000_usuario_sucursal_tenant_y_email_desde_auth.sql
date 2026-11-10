-- Asignaciones de usuario a sucursal acotadas al tenant, y email del usuario
-- tomado de Supabase Auth.
--
-- 1. Una asignación (usuario_sucursal) solo puede unir un usuario, una sucursal
--    y un rol del mismo tenant. El service ya lo valida al asignar, pero la base
--    lo permitía. Se garantiza con FKs compuestas (mismo recurso que
--    cliente_region → region_sucursal): usuario_sucursal guarda el tenant_id, y
--    el usuario, la sucursal y el rol tienen que existir con ese mismo tenant.
--    Las FKs compuestas reemplazan a las simples y conservan su ON DELETE.
--
-- 2. El email de un usuario es el de su cuenta de Supabase Auth
--    (auth.users.email). La copia en public.usuario no se mantenía sincronizada
--    con Auth (un cambio de email en Auth no la actualizaba), así que se
--    elimina: el backend lo obtiene uniendo auth.users por usuario.auth_id. Un
--    usuario sin auth_id queda sin email.

-- ============================================================
-- 1. usuario_sucursal: usuario, sucursal y rol del mismo tenant
-- ============================================================

-- Si ya hay asignaciones que cruzan tenants, las FKs fallarían con un error
-- poco claro: se corta antes con uno que dice qué corregir.
DO $$
DECLARE
  usuarios_ajenos INTEGER;
  roles_ajenos    INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE u.tenant_id <> s.tenant_id),
         COUNT(*) FILTER (WHERE r.tenant_id <> s.tenant_id)
  INTO usuarios_ajenos, roles_ajenos
  FROM public.usuario_sucursal us
  JOIN public.usuario  u ON u.id = us.usuario_id
  JOIN public.sucursal s ON s.id = us.sucursal_id
  JOIN public.rol      r ON r.id = us.id_rol;

  IF usuarios_ajenos > 0 OR roles_ajenos > 0 THEN
    RAISE EXCEPTION 'Hay asignaciones a sucursales con un usuario (%) o un rol (%) de otro tenant; corregirlas antes de aplicar esta migración.',
      usuarios_ajenos, roles_ajenos;
  END IF;
END $$;

-- Destino de las FKs compuestas.
ALTER TABLE public.usuario
  ADD CONSTRAINT usuario_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE public.sucursal
  ADD CONSTRAINT sucursal_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE public.rol
  ADD CONSTRAINT rol_id_tenant_unique UNIQUE (id, tenant_id);

ALTER TABLE public.usuario_sucursal
  ADD COLUMN tenant_id UUID;

UPDATE public.usuario_sucursal us
SET tenant_id = s.tenant_id
FROM public.sucursal s
WHERE s.id = us.sucursal_id;

ALTER TABLE public.usuario_sucursal
  ALTER COLUMN tenant_id SET NOT NULL,
  DROP CONSTRAINT usuario_sucursal_usuario_id_fkey,
  DROP CONSTRAINT usuario_sucursal_sucursal_id_fkey,
  DROP CONSTRAINT usuario_sucursal_id_rol_fkey,
  ADD CONSTRAINT usuario_sucursal_usuario_tenant_fkey
    FOREIGN KEY (usuario_id, tenant_id)
    REFERENCES public.usuario (id, tenant_id) ON DELETE CASCADE,
  ADD CONSTRAINT usuario_sucursal_sucursal_tenant_fkey
    FOREIGN KEY (sucursal_id, tenant_id)
    REFERENCES public.sucursal (id, tenant_id) ON DELETE CASCADE,
  ADD CONSTRAINT usuario_sucursal_rol_tenant_fkey
    FOREIGN KEY (id_rol, tenant_id)
    REFERENCES public.rol (id, tenant_id);

COMMENT ON COLUMN public.usuario_sucursal.tenant_id IS
  'Tenant del usuario, de la sucursal y del rol. Las FKs compuestas impiden asignar un usuario o un rol de otro tenant.';

-- ============================================================
-- 2. usuario: el email sale de auth.users
-- ============================================================

ALTER TABLE public.usuario
  DROP COLUMN email;
