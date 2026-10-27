import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { withTransaction } from '../utils/db-transaction';

export interface RegionData {
  nombre: string;
  descuento?: number;
  activo?: boolean;
  /** Puntos de venta (sucursales) que forman la región. */
  sucursal_ids: string[];
}

export interface RegionRow {
  id: string;
  tenant_id: string;
  nombre: string;
  descuento: number;
  activo: boolean;
  /** Puntos de venta de la región, ordenados por nombre. */
  sucursales: { id: string; nombre: string }[];
  created_at: string;
  updated_at: string;
}

export interface ClienteRegionRow {
  id: string;
  cliente_id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  region_id: string;
  region_nombre: string;
  descuento: number;
  created_at: string;
}

/** Región con sus puntos de venta. `r` es el alias de public.region en la consulta. */
const SELECT_REGION = `
  SELECT r.*,
         COALESCE((
           SELECT json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre)
           FROM public.region_sucursal rs
           JOIN public.sucursal s ON s.id = rs.sucursal_id
           WHERE rs.region_id = r.id
         ), '[]'::json) AS sucursales
  FROM public.region r
`;

export class RegionRepository {
  async findAll(tenantId: string, soloActivas = false): Promise<RegionRow[]> {
    const { rows } = await pool.query(
      `${SELECT_REGION}
       WHERE r.tenant_id = $1 ${soloActivas ? 'AND r.activo = TRUE' : ''}
       ORDER BY r.nombre ASC`,
      [tenantId]
    );
    return rows;
  }

  /** Regiones que incluyen el punto de venta (para asignarle una a un cliente). */
  async findBySucursal(sucursalId: string, tenantId: string, soloActivas = false): Promise<RegionRow[]> {
    const { rows } = await pool.query(
      `${SELECT_REGION}
       WHERE r.tenant_id = $2
         AND EXISTS (SELECT 1 FROM public.region_sucursal rs WHERE rs.region_id = r.id AND rs.sucursal_id = $1)
         ${soloActivas ? 'AND r.activo = TRUE' : ''}
       ORDER BY r.nombre ASC`,
      [sucursalId, tenantId]
    );
    return rows;
  }

  async findById(id: string, tenantId: string): Promise<RegionRow | null> {
    const { rows } = await pool.query(`${SELECT_REGION} WHERE r.id = $1 AND r.tenant_id = $2 LIMIT 1`, [id, tenantId]);
    return rows[0] ?? null;
  }

  async create(tenantId: string, data: RegionData): Promise<RegionRow> {
    const id = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.region (tenant_id, nombre, descuento, activo)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantId, data.nombre, data.descuento ?? 0, data.activo ?? true]
      );
      await this.sincronizarSucursales(client, rows[0].id, data.sucursal_ids);
      return rows[0].id as string;
    });
    return (await this.findById(id, tenantId))!;
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Pick<RegionData, 'nombre' | 'descuento' | 'activo' | 'sucursal_ids'>>
  ): Promise<RegionRow | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.nombre !== undefined) {
      fields.push(`nombre = $${idx++}`);
      values.push(data.nombre);
    }
    if (data.descuento !== undefined) {
      fields.push(`descuento = $${idx++}`);
      values.push(data.descuento);
    }
    if (data.activo !== undefined) {
      fields.push(`activo = $${idx++}`);
      values.push(data.activo);
    }

    if (fields.length === 0 && data.sucursal_ids === undefined) return null;

    fields.push('updated_at = NOW()');

    const actualizada = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE public.region
         SET ${fields.join(', ')}
         WHERE id = $${idx++} AND tenant_id = $${idx}
         RETURNING id`,
        [...values, id, tenantId]
      );
      if (!rows[0]) return false;
      if (data.sucursal_ids !== undefined) await this.sincronizarSucursales(client, id, data.sucursal_ids);
      return true;
    });
    return actualizada ? this.findById(id, tenantId) : null;
  }

  /** Deja la región con exactamente estos puntos de venta. */
  private async sincronizarSucursales(client: PoolClient, regionId: string, sucursalIds: string[]) {
    await client.query(
      'DELETE FROM public.region_sucursal WHERE region_id = $1 AND NOT (sucursal_id = ANY($2::uuid[]))',
      [regionId, sucursalIds]
    );
    await client.query(
      `INSERT INTO public.region_sucursal (region_id, sucursal_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [regionId, sucursalIds]
    );
  }

  async desactivar(id: string, tenantId: string): Promise<RegionRow | null> {
    const { rows } = await pool.query(
      `UPDATE public.region
       SET activo = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    return rows[0] ? this.findById(id, tenantId) : null;
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM public.region
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows.length > 0;
  }

  /** Clientes que usan la región en cada uno de los puntos de venta indicados. */
  async contarClientesPorSucursal(regionId: string, sucursalIds: string[]): Promise<{ sucursal_nombre: string; clientes: number }[]> {
    const { rows } = await pool.query(
      `SELECT s.nombre AS sucursal_nombre, COUNT(*)::int AS clientes
       FROM public.cliente_region cr
       JOIN public.sucursal s ON s.id = cr.sucursal_id
       WHERE cr.region_id = $1 AND cr.sucursal_id = ANY($2::uuid[])
       GROUP BY s.nombre
       ORDER BY s.nombre`,
      [regionId, sucursalIds]
    );
    return rows;
  }

  async sucursalesDelTenant(sucursalIds: string[], tenantId: string): Promise<number> {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM public.sucursal WHERE id = ANY($1::uuid[]) AND tenant_id = $2',
      [sucursalIds, tenantId]
    );
    return rows[0].total;
  }

  async contarClientesEnRegion(regionId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) AS total
      FROM public.cliente_region
      WHERE region_id = $1
    `;
    const { rows } = await pool.query(query, [regionId]);
    return Number(rows[0]?.total ?? 0);
  }

  async sucursalPerteneceAlTenant(sucursalId: string, tenantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM public.sucursal WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [sucursalId, tenantId]
    );
    return rows.length > 0;
  }

  // --- Operaciones de asignación de cliente_region ---

  async findRegionesPorCliente(clienteId: string, tenantId: string): Promise<ClienteRegionRow[]> {
    const query = `
      SELECT
        cr.id,
        cr.cliente_id,
        cr.sucursal_id,
        s.nombre AS sucursal_nombre,
        cr.region_id,
        r.nombre AS region_nombre,
        r.descuento,
        cr.created_at
      FROM public.cliente_region cr
      JOIN public.region r   ON r.id = cr.region_id
      JOIN public.sucursal s ON s.id = cr.sucursal_id
      JOIN public.cliente c  ON c.id = cr.cliente_id
      WHERE cr.cliente_id = $1
        AND c.tenant_id = $2
        AND r.tenant_id = $2
      ORDER BY s.nombre ASC
    `;
    const { rows } = await pool.query(query, [clienteId, tenantId]);
    return rows;
  }

  async asignarRegionCliente(
    clienteId: string,
    sucursalId: string,
    regionId: string,
    tenantId: string
  ): Promise<ClienteRegionRow | null> {
    // Validar pertenencia del cliente y de la región al tenant
    const query = `
      INSERT INTO public.cliente_region (cliente_id, sucursal_id, region_id)
      SELECT c.id, s.id, r.id
      FROM public.cliente c
      JOIN public.sucursal s ON s.id = $2 AND s.tenant_id = $4
      JOIN public.region r   ON r.id = $3 AND r.tenant_id = $4
      JOIN public.region_sucursal rs ON rs.region_id = r.id AND rs.sucursal_id = s.id
      WHERE c.id = $1 AND c.tenant_id = $4
      ON CONFLICT (cliente_id, sucursal_id)
      DO UPDATE SET region_id = EXCLUDED.region_id
      RETURNING *
    `;
    const { rows } = await pool.query(query, [clienteId, sucursalId, regionId, tenantId]);
    if (rows.length === 0) return null;

    // Retornar con nombres
    const asignaciones = await this.findRegionesPorCliente(clienteId, tenantId);
    return asignaciones.find((a) => a.sucursal_id === sucursalId) ?? null;
  }

  async quitarRegionCliente(clienteId: string, sucursalId: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM public.cliente_region cr
      USING public.cliente c
      WHERE cr.cliente_id = c.id
        AND cr.cliente_id = $1
        AND cr.sucursal_id = $2
        AND c.tenant_id = $3
      RETURNING cr.id
    `;
    const { rows } = await pool.query(query, [clienteId, sucursalId, tenantId]);
    return rows.length > 0;
  }
}
