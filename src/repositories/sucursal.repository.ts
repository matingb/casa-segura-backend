import { pool } from '../config/db';

export class SucursalRepository {
  async findAll(tenantId: string) {
    const query = 'SELECT * FROM public.sucursal WHERE tenant_id = $1 ORDER BY es_central DESC, nombre';
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }
}
