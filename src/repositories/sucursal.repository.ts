import { pool } from '../config/db';
import { withTransaction } from '../utils/db-transaction';

export interface SucursalData {
  nombre: string;
  es_central?: boolean;
  valor_dolar?: number | null;
  descuento?: number | null;
  activo?: boolean;
}

export class SucursalRepository {
  /** `asignado` indica si el usuario autenticado está asignado a cada sucursal. */
  async findAll(tenantId: string, authId: string, soloActivas = false) {
    const query = `
      SELECT s.*,
             EXISTS (
               SELECT 1 FROM public.usuario_sucursal us
               JOIN public.usuario u ON u.id = us.usuario_id
               WHERE us.sucursal_id = s.id AND u.auth_id = $2
             ) AS asignado
      FROM public.sucursal s
      WHERE s.tenant_id = $1 ${soloActivas ? 'AND s.activo = TRUE' : ''}
      ORDER BY s.es_central DESC, s.nombre
    `;
    const { rows } = await pool.query(query, [tenantId, authId]);
    return rows;
  }

  /** Incluye sucursales inactivas: las asignaciones se conservan al darlas de baja. */
  async estaAsignado(id: string, authId: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.usuario_sucursal us
         JOIN public.usuario u ON u.id = us.usuario_id
         WHERE us.sucursal_id = $1 AND u.auth_id = $2
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
        AND s.activo = TRUE
      ORDER BY s.es_central DESC, s.nombre
    `;
    const { rows } = await pool.query(query, [authId, tenantId]);
    return rows;
  }

  /**
   * Quien crea la sucursal queda asignado a ella, con el rol Administrador del
   * tenant (o, si no existe, el que ya tenga en otra sucursal): sin asignación no
   * podría editarla.
   */
  async create(tenantId: string, data: SucursalData, authId: string) {
    return withTransaction(async (client) => {
      // Solo puede haber una casa central por tenant.
      if (data.es_central) {
        await client.query(
          'UPDATE public.sucursal SET es_central = FALSE, updated_at = NOW() WHERE tenant_id = $1 AND es_central = TRUE',
          [tenantId]
        );
      }
      const { rows } = await client.query(
        `INSERT INTO public.sucursal (tenant_id, nombre, es_central, valor_dolar, descuento, activo)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          tenantId,
          data.nombre,
          data.es_central ?? false,
          data.valor_dolar ?? null,
          data.descuento ?? null,
          data.activo ?? true,
        ]
      );
      const sucursal = rows[0];
      const { rows: asignacion } = await client.query(
        `INSERT INTO public.usuario_sucursal (usuario_id, sucursal_id, id_rol)
         SELECT u.id, $2, COALESCE(
           (SELECT r.id FROM public.rol r WHERE r.tenant_id = u.tenant_id AND r.nombre = 'Administrador' LIMIT 1),
           (SELECT us.id_rol FROM public.usuario_sucursal us WHERE us.usuario_id = u.id LIMIT 1)
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

  async update(id: string, tenantId: string, data: Partial<SucursalData>) {
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
    if (updates.length === 0) return null;

    return withTransaction(async (client) => {
      if (data.es_central) {
        await client.query(
          'UPDATE public.sucursal SET es_central = FALSE, updated_at = NOW() WHERE tenant_id = $1 AND es_central = TRUE AND id <> $2',
          [tenantId, id]
        );
      }
      updates.push('updated_at = NOW()');
      const { rows } = await client.query(
        `UPDATE public.sucursal
         SET ${updates.join(', ')}
         WHERE id = $${idx++} AND tenant_id = $${idx}
         RETURNING *`,
        [...values, id, tenantId]
      );
      return rows[0] ?? null;
    });
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
         (SELECT COUNT(*) FROM public.usuario_sucursal us WHERE us.sucursal_id = $1) AS usuarios`,
      [id]
    );
    return {
      productosConStock: Number(rows[0].con_stock),
      usuarios: Number(rows[0].usuarios),
    };
  }
}
