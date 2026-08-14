import { pool } from '../config/db';

export class CuentaFinancieraRepository {
  async findAll(tenantId: string) {
    const query = 'SELECT * FROM public.cuenta_financiera WHERE tenant_id = $1 ORDER BY nombre';
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findById(tenantId: string, id: string) {
    const query = 'SELECT * FROM public.cuenta_financiera WHERE tenant_id = $1 AND id = $2';
    const { rows } = await pool.query(query, [tenantId, id]);
    return rows[0] ?? null;
  }

  async insert(tenantId: string, data: {
    nombre: string;
    saldo_inicial: number;
    porcentaje_extra: number;
  }) {
    const query = `
      INSERT INTO public.cuenta_financiera (tenant_id, nombre, saldo_inicial, saldo_actual, porcentaje_extra)
      VALUES ($1, $2, $3, $3, $4)
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      tenantId,
      data.nombre,
      data.saldo_inicial,
      data.porcentaje_extra,
    ]);
    return rows[0];
  }

  async update(tenantId: string, id: string, data: {
    nombre?: string;
    saldo_inicial?: number;
    porcentaje_extra?: number;
  }) {
    const query = `
      UPDATE public.cuenta_financiera
      SET
        nombre           = COALESCE($3, nombre),
        saldo_inicial    = COALESCE($4, saldo_inicial),
        porcentaje_extra = COALESCE($5, porcentaje_extra),
        updated_at       = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      tenantId,
      id,
      data.nombre ?? null,
      data.saldo_inicial ?? null,
      data.porcentaje_extra ?? null,
    ]);
    return rows[0] ?? null;
  }
}
