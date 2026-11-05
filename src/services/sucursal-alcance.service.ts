import { pool } from '../config/db';
import { CatalogoError } from '../utils/errors';

/** Alcance autenticado de una solicitud. Las listas se construyen desde la BD, nunca desde el body. */
export interface SucursalAlcance {
  authId: string;
  usuarioId: string;
  tenantId: string;
  sucursalIds: string[];
  sucursalesActivasIds: string[];
}

export async function resolverSucursalAlcance(authId: string): Promise<SucursalAlcance> {
  const { rows } = await pool.query(
    `SELECT u.id AS usuario_id, u.tenant_id, u.activo AS usuario_activo,
            s.id AS sucursal_id, s.activo AS sucursal_activa
     FROM public.usuario u
     LEFT JOIN public.usuario_sucursal us
       ON us.usuario_id = u.id AND us.activo = TRUE
     LEFT JOIN public.sucursal s
       ON s.id = us.sucursal_id AND s.tenant_id = u.tenant_id
     WHERE u.auth_id = $1`,
    [authId]
  );

  const usuario = rows[0];
  if (!usuario || usuario.usuario_activo !== true) {
    throw new CatalogoError('La cuenta no tiene acceso a este recurso.', 'SIN_PERMISO', 403);
  }

  const sucursales = rows
    .filter((row) => typeof row.sucursal_id === 'string')
    .filter((row) => row.tenant_id === usuario.tenant_id);
  return {
    authId,
    usuarioId: usuario.usuario_id as string,
    tenantId: usuario.tenant_id as string,
    sucursalIds: [...new Set(sucursales.map((row) => row.sucursal_id as string))],
    sucursalesActivasIds: [...new Set(sucursales.filter((row) => row.sucursal_activa === true).map((row) => row.sucursal_id as string))],
  };
}

export function exigirSucursal(alcance: SucursalAlcance, sucursalId: string, activa = false): void {
  const permitidas = activa ? alcance.sucursalesActivasIds : alcance.sucursalIds;
  if (!permitidas.includes(sucursalId)) {
    throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
  }
}

export function recursoNoDisponible(): CatalogoError {
  return new CatalogoError('El recurso no está disponible.', 'RECURSO_NO_DISPONIBLE', 404);
}
