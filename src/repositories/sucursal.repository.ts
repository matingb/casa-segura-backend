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
  async findAll(tenantId: string, soloActivas = false) {
    const query = `
      SELECT * FROM public.sucursal
      WHERE tenant_id = $1 ${soloActivas ? 'AND activo = TRUE' : ''}
      ORDER BY es_central DESC, nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
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

  async create(tenantId: string, data: SucursalData) {
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
      return rows[0];
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
