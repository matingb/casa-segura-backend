import { pool } from '../config/db';

export class ProductoSucursalRepository {
  async findAll(tenantId: string) {
    const query = `
      SELECT ps.*,
             p.codigo          AS producto_codigo,
             p.nombre          AS producto_nombre,
             p.marca           AS producto_marca,
             p.modelo          AS producto_modelo,
             p.imagen_url      AS producto_imagen_url,
             s.nombre          AS sucursal_nombre
      FROM public.producto_sucursal ps
      JOIN public.producto  p ON p.id = ps.producto_id
      JOIN public.sucursal  s ON s.id = ps.sucursal_id
      WHERE p.tenant_id = $1
      ORDER BY s.nombre, p.nombre
    `;
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }
}
