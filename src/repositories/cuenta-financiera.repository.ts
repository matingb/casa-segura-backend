import { pool } from '../config/db';

export class CuentaFinancieraRepository {
  async findAll(tenantId: string) {
    const query = 'SELECT * FROM public.cuenta_financiera WHERE tenant_id = $1 ORDER BY nombre';
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }
}
