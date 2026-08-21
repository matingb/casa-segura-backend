import { pool } from '../config/db';

export class TipoOperacionRepository {
  async findAll() {
    const query = 'SELECT id, nombre FROM public.tipo_operacion ORDER BY nombre';
    const { rows } = await pool.query(query);
    return rows;
  }
}
