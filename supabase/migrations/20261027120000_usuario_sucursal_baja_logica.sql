-- Asignación de usuarios a sucursales: baja lógica.
--
-- `operacion.usuario_sucursal_id` (y `cancelled_by_usuario_sucursal_id`) apuntan
-- a la asignación para registrar quién operó y en qué sucursal: borrar la fila
-- rompería ese historial. Quitar a un usuario de una sucursal la deja inactiva;
-- volver a asignarlo la reactiva (la unicidad usuario/sucursal se mantiene).

ALTER TABLE public.usuario_sucursal
  ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_usuario_sucursal_sucursal_activo
  ON public.usuario_sucursal (sucursal_id, activo);

COMMENT ON COLUMN public.usuario_sucursal.activo IS
  'Baja lógica. Una asignación inactiva no da acceso a la sucursal, pero conserva las operaciones registradas con ella.';
