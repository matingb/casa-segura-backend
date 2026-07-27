import { pool } from '../config/db';

export class ProductoRepository {
  async findAll() {
    // Obtenemos todos los productos desde la base de datos con una query SQL nativa
    const query = 'SELECT * FROM public.producto';
    const { rows } = await pool.query(query);
    
    return rows;
  }
}
