import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { withTransaction } from '../utils/db-transaction';

export interface SucursalData {
  nombre: string;
  es_central?: boolean;
  valor_dolar?: string | null;
  descuento?: number | null;
  activo?: boolean;
}

export interface AsignacionUsuario {
  usuario_id: string;
  id_rol: string;
}

export class SucursalRepository {
  /** `asignado` indica si el usuario autenticado está asignado a cada sucursal. */
  async findAll(tenantId: string, authId: string, soloActivas = false, sucursalIds?: string[]) {
    if (sucursalIds && sucursalIds.length === 0) return [];
    const query = `
      SELECT s.*,
             EXISTS (
               SELECT 1 FROM public.usuario_sucursal us
               JOIN public.usuario u ON u.id = us.usuario_id
               WHERE us.sucursal_id = s.id AND u.auth_id = $2 AND u.activo = TRUE
                 AND u.tenant_id = s.tenant_id AND us.activo = TRUE
             ) AS asignado
      FROM public.sucursal s
      WHERE s.tenant_id = $1
        AND ($3::uuid[] IS NULL OR s.id = ANY($3::uuid[]))
        ${soloActivas ? 'AND s.activo = TRUE' : ''}
      ORDER BY s.es_central DESC, s.nombre
    `;
    const { rows } = await pool.query(query, [tenantId, authId, sucursalIds ?? null]);
    return rows;
  }

  async findReferenciasGlobales(tenantId: string) {
    const { rows } = await pool.query(
      `SELECT id, nombre, activo, es_central
       FROM public.sucursal WHERE tenant_id = $1
       ORDER BY es_central DESC, nombre`,
      [tenantId]
    );
    return rows;
  }

  /** Incluye sucursales inactivas: las asignaciones se conservan al darlas de baja. */
  async estaAsignado(id: string, authId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.usuario_sucursal us
         JOIN public.usuario u ON u.id = us.usuario_id
         WHERE us.sucursal_id = $1 AND u.auth_id = $2 AND u.activo = TRUE AND us.activo = TRUE
       ) AS asignado`,
      [id, authId]
    );
    return rows[0].asignado === true;
  }

  async findById(id: string, tenantId: string) {
    const { rows } = await pool.query(
      'SELECT * FROM public.sucursal WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  async findByUsuario(authId: string, tenantId: string) {
    const query = `
      SELECT s.id,
             s.nombre,
             s.es_central,
             s.valor_dolar,
             s.valor_dolar_version,
             s.valor_dolar_actualizada_at,
             s.valor_dolar_actualizada_por,
             s.descuento,
             s.activo,
             us.id AS usuario_sucursal_id,
             us.id_rol,
             r.nombre AS rol_nombre
      FROM public.sucursal s
      JOIN public.usuario_sucursal us ON us.sucursal_id = s.id
      JOIN public.usuario u           ON u.id = us.usuario_id
      JOIN public.rol r               ON r.id = us.id_rol
      WHERE u.auth_id = $1
        AND s.tenant_id = $2
        AND u.tenant_id = s.tenant_id
        AND u.activo = TRUE
        AND s.activo = TRUE
        AND us.activo = TRUE
      ORDER BY s.es_central DESC, s.nombre
    `;
    const { rows } = await pool.query(query, [authId, tenantId]);
    return rows;
  }

  /**
   * Con `usuarios`, la sucursal queda con esas asignaciones (el service ya
   * incluyó a quien la crea). Sin ellas, quien la crea queda asignado con el rol
   * Administrador del tenant (o, si no existe, el que ya tenga en otra
   * sucursal): sin asignación no podría editarla.
   */
  async create(tenantId: string, data: SucursalData, authId: string, usuarios?: AsignacionUsuario[]) {
    return withTransaction(async (client) => {
      // Solo puede haber una casa central por tenant.
      if (data.es_central) {
        await client.query(
          'UPDATE public.sucursal SET es_central = FALSE, updated_at = NOW() WHERE tenant_id = $1 AND es_central = TRUE',
          [tenantId]
        );
      }
      const { rows } = await client.query(
        `INSERT INTO public.sucursal (
           tenant_id, nombre, es_central, valor_dolar, descuento, activo,
           valor_dolar_version, valor_dolar_actualizada_at, valor_dolar_actualizada_por
         )
         VALUES ($1, $2, $3, $4, $5, $6,
           CASE WHEN $4::numeric IS NULL THEN 0 ELSE 1 END,
           CASE WHEN $4::numeric IS NULL THEN NULL ELSE NOW() END,
           CASE WHEN $4::numeric IS NULL THEN NULL ELSE
             (SELECT u.id FROM public.usuario u WHERE u.auth_id = $7 AND u.tenant_id = $1) END
         )
         RETURNING *`,
        [
          tenantId,
          data.nombre,
          data.es_central ?? false,
          data.valor_dolar ?? null,
          data.descuento ?? null,
          data.activo ?? true,
          authId,
        ]
      );
      const sucursal = rows[0];
      if (usuarios) {
        await this.sincronizarUsuarios(client, sucursal.id, tenantId, usuarios);
        return { ...sucursal, asignado: true };
      }
      const { rows: asignacion } = await client.query(
        `INSERT INTO public.usuario_sucursal (usuario_id, sucursal_id, tenant_id, id_rol)
         SELECT u.id, $2, u.tenant_id, COALESCE(
           (SELECT r.id FROM public.rol r WHERE r.tenant_id = u.tenant_id AND r.nombre = 'Administrador' LIMIT 1),
           (SELECT us.id_rol FROM public.usuario_sucursal us WHERE us.usuario_id = u.id AND us.activo = TRUE LIMIT 1)
         )
         FROM public.usuario u
         WHERE u.auth_id = $1 AND u.tenant_id = $3
         RETURNING id`,
        [authId, sucursal.id, tenantId]
      );
      if (!asignacion[0]) throw new Error('No se pudo asignar la sucursal al usuario que la crea.');
      return { ...sucursal, asignado: true };
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<SucursalData>,
    usuarios?: AsignacionUsuario[],
    transactionClient?: PoolClient,
    authId?: string
  ) {
    const fields = ['nombre', 'es_central', 'valor_dolar', 'descuento', 'activo'];
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields) {
      if (field in data) {
        updates.push(`${field} = $${idx++}`);
        values.push((data as Record<string, unknown>)[field]);
      }
    }
    if (updates.length === 0 && !usuarios) return null;

    const ejecutar = async (client: PoolClient) => {
      if (data.es_central) {
        await client.query(
          'UPDATE public.sucursal SET es_central = FALSE, updated_at = NOW() WHERE tenant_id = $1 AND es_central = TRUE AND id <> $2',
          [tenantId, id]
        );
      }
      if ('valor_dolar' in data) {
        updates.push('valor_dolar_version = valor_dolar_version + 1', 'valor_dolar_actualizada_at = NOW()');
        const authIndex = idx++;
        values.push(authId ?? null);
        const tenantIndex = idx++;
        values.push(tenantId);
        updates.push(`valor_dolar_actualizada_por = (SELECT u.id FROM public.usuario u WHERE u.auth_id = $${authIndex} AND u.tenant_id = $${tenantIndex})`);
      }
      updates.push('updated_at = NOW()');
      const { rows } = await client.query(
        `UPDATE public.sucursal
         SET ${updates.join(', ')}
         WHERE id = $${idx++} AND tenant_id = $${idx}
         RETURNING *`,
        [...values, id, tenantId]
      );
      if (rows[0] && usuarios) await this.sincronizarUsuarios(client, id, tenantId, usuarios);
      return rows[0] ?? null;
    };
    return transactionClient ? ejecutar(transactionClient) : withTransaction(ejecutar);
  }

  /**
   * Deja la sucursal con exactamente estas asignaciones. Quitar es baja lógica
   * (las operaciones apuntan a la asignación); volver a asignar la reactiva.
   * La base rechaza (FK compuesta) un usuario o un rol de otro tenant que la sucursal.
   */
  private async sincronizarUsuarios(
    client: PoolClient,
    sucursalId: string,
    tenantId: string,
    usuarios: AsignacionUsuario[]
  ) {
    const ids = usuarios.map((u) => u.usuario_id);
    await client.query(
      `UPDATE public.usuario_sucursal SET activo = FALSE
       WHERE sucursal_id = $1 AND activo = TRUE AND NOT (usuario_id = ANY($2::uuid[]))`,
      [sucursalId, ids]
    );
    await client.query(
      `INSERT INTO public.usuario_sucursal (usuario_id, sucursal_id, tenant_id, id_rol)
       SELECT a.usuario_id, $1, $4, a.id_rol
       FROM unnest($2::uuid[], $3::uuid[]) AS a(usuario_id, id_rol)
       ON CONFLICT (usuario_id, sucursal_id)
       DO UPDATE SET id_rol = EXCLUDED.id_rol, activo = TRUE`,
      [sucursalId, ids, usuarios.map((u) => u.id_rol), tenantId]
    );
  }

  /**
   * Usuarios asignados (activos) a la sucursal; `es_actual` marca al autenticado.
   * El email sale de su cuenta de Auth.
   */
  async findUsuariosAsignados(sucursalId: string, authId: string) {
    const { rows } = await pool.query(
      `SELECT u.id AS usuario_id, u.nombre, au.email, us.id_rol, r.nombre AS rol_nombre,
              (u.auth_id = $2) AS es_actual
       FROM public.usuario_sucursal us
       JOIN public.usuario u ON u.id = us.usuario_id
       JOIN public.rol r     ON r.id = us.id_rol
       LEFT JOIN auth.users au ON au.id = u.auth_id
       WHERE us.sucursal_id = $1 AND us.activo = TRUE
       ORDER BY u.nombre`,
      [sucursalId, authId]
    );
    return rows;
  }

  /**
   * Usuarios activos del tenant que se pueden asignar; `es_actual` marca al
   * autenticado. El email sale de su cuenta de Auth.
   */
  async findUsuariosDelTenant(tenantId: string, authId: string) {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, au.email, (u.auth_id = $2) AS es_actual
       FROM public.usuario u
       LEFT JOIN auth.users au ON au.id = u.auth_id
       WHERE u.tenant_id = $1 AND u.activo = TRUE
       ORDER BY u.nombre`,
      [tenantId, authId]
    );
    return rows as { id: string; nombre: string; email: string | null; es_actual: boolean }[];
  }

  async findRolesDelTenant(tenantId: string) {
    const { rows } = await pool.query(
      'SELECT id, nombre FROM public.rol WHERE tenant_id = $1 ORDER BY nombre',
      [tenantId]
    );
    return rows as { id: string; nombre: string }[];
  }

  /** Administrador = algún rol suyo, en una sucursal activa, tiene el permiso `usuarios.administrar`. */
  async esAdministrador(authId: string, tenantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.usuario u
         JOIN public.usuario_sucursal us ON us.usuario_id = u.id AND us.activo = TRUE
         JOIN public.sucursal s ON s.id = us.sucursal_id AND s.tenant_id = u.tenant_id AND s.activo = TRUE
         JOIN public.permiso_rol pr ON pr.id_rol = us.id_rol
         JOIN public.permiso p ON p.id = pr.id_permiso AND p.nombre = 'usuarios.administrar'
         WHERE u.auth_id = $1 AND u.tenant_id = $2 AND u.activo = TRUE
       ) AS es_admin`,
      [authId, tenantId]
    );
    return rows[0].es_admin === true;
  }

  /**
   * Baja lógica: la sucursal deja de ofrecerse pero conserva su stock,
   * su historial de operaciones y las asignaciones de usuarios.
   */
  async desactivar(id: string, tenantId: string) {
    const { rows } = await pool.query(
      `UPDATE public.sucursal
       SET activo = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  async contarActivas(tenantId: string): Promise<number> {
    const { rows } = await pool.query(
      'SELECT COUNT(*) FROM public.sucursal WHERE tenant_id = $1 AND activo = TRUE',
      [tenantId]
    );
    return Number(rows[0].count);
  }

  /** Resumen de lo que quedaría inaccesible al dar de baja la sucursal. */
  async resumenUso(id: string) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM public.producto_sucursal ps
           WHERE ps.sucursal_id = $1 AND ps.deleted_at IS NULL
             AND (ps.cantidad_disponible <> 0 OR ps.cantidad_reservada <> 0)) AS con_stock,
         (SELECT COUNT(*) FROM public.usuario_sucursal us WHERE us.sucursal_id = $1 AND us.activo = TRUE) AS usuarios`,
      [id]
    );
    return {
      productosConStock: Number(rows[0].con_stock),
      usuarios: Number(rows[0].usuarios),
    };
  }
}
