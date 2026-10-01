import { pool } from '../config/db';

export interface RegionData {
  sucursal_id: string;
  nombre: string;
  descuento?: number;
  activo?: boolean;
}

export interface RegionRow {
  id: string;
  tenant_id: string;
  sucursal_id: string;
  nombre: string;
  descuento: number;
  activo: boolean;
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

export class RegionRepository {
  async findBySucursal(sucursalId: string, tenantId: string, soloActivas = false): Promise<RegionRow[]> {
    const query = `
      SELECT r.*
      FROM public.region r
      JOIN public.sucursal s ON s.id = r.sucursal_id
      WHERE r.sucursal_id = $1
        AND r.tenant_id = $2
        AND s.tenant_id = $2
        ${soloActivas ? 'AND r.activo = TRUE' : ''}
      ORDER BY r.nombre ASC
    `;
    const { rows } = await pool.query(query, [sucursalId, tenantId]);
    return rows;
  }

  async findById(id: string, tenantId: string): Promise<RegionRow | null> {
    const query = `
      SELECT *
      FROM public.region
      WHERE id = $1 AND tenant_id = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
  }

  async create(tenantId: string, data: RegionData): Promise<RegionRow> {
    const query = `
      INSERT INTO public.region (tenant_id, sucursal_id, nombre, descuento, activo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      tenantId,
      data.sucursal_id,
      data.nombre,
      data.descuento ?? 0,
      data.activo ?? true,
    ]);
    return rows[0];
  }

  async update(id: string, tenantId: string, data: Partial<Pick<RegionData, 'nombre' | 'descuento' | 'activo'>>): Promise<RegionRow | null> {
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

    if (fields.length === 0) return null;

    fields.push('updated_at = NOW()');

    const query = `
      UPDATE public.region
      SET ${fields.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING *
    `;
    const { rows } = await pool.query(query, [...values, id, tenantId]);
    return rows[0] ?? null;
  }

  async desactivar(id: string, tenantId: string): Promise<RegionRow | null> {
    const query = `
      UPDATE public.region
      SET activo = FALSE, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;
    const { rows } = await pool.query(query, [id, tenantId]);
    return rows[0] ?? null;
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
      JOIN public.region r   ON r.id = $3 AND r.tenant_id = $4 AND r.sucursal_id = s.id
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
