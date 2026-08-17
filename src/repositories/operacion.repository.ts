import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';

export class OperacionRepository {
  async findAll(tenantId: string, sucursalId?: string, tipoId?: string) {
    const params: unknown[] = [tenantId];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND us.sucursal_id = $${params.length}`;
    }
    let tipoClause = '';
    if (tipoId) {
      params.push(tipoId);
      tipoClause = `AND o.tipo_id = $${params.length}`;
    }
    const query = `
      SELECT o.*,
             to2.nombre     AS tipo_nombre,
             u.nombre       AS usuario_nombre,
             s.nombre       AS sucursal_nombre,
             us.sucursal_id AS sucursal_id
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause}
      ORDER BY o.fecha DESC
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string, tipoId?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let sucursalClause = '';
    if (sucursalId) {
      params.push(sucursalId);
      sucursalClause = `AND us.sucursal_id = $${params.length}`;
    }
    let tipoClause = '';
    if (tipoId) {
      params.push(tipoId);
      tipoClause = `AND o.tipo_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT o.*,
              to2.nombre     AS tipo_nombre,
              u.nombre       AS usuario_nombre,
              s.nombre       AS sucursal_nombre,
              us.sucursal_id AS sucursal_id
       FROM public.operacion o
       JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
       JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
       JOIN public.usuario           u  ON u.id   = us.usuario_id
       JOIN public.sucursal          s  ON s.id   = us.sucursal_id
       WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause}
       ORDER BY o.fecha DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }

  async findById(tenantId: string, id: string) {
    const opQuery = `
      SELECT o.*,
             to2.nombre   AS tipo_nombre,
             u.nombre     AS usuario_nombre,
             u.email      AS usuario_email,
             s.nombre     AS sucursal_nombre,
             us.sucursal_id AS sucursal_id,
             -- Venta
             v.subtotal_ars AS venta_subtotal_ars,
             v.descuento_ars AS venta_descuento_ars,
             v.total_ars    AS venta_total_ars,
             -- Compra
             c.subtotal_ars AS compra_subtotal_ars,
             c.otros_impuestos_ars AS compra_otros_impuestos_ars,
             c.total_ars    AS compra_total_ars,
             c.numero_factura AS compra_numero_factura,
             c.numero_remito  AS compra_numero_remito,
             prov.id          AS proveedor_id,
             prov.nombre      AS proveedor_nombre,
             -- Traslado
             t.costo_flete_ars AS traslado_costo_flete_ars,
             s_dest.id        AS sucursal_destino_id,
             s_dest.nombre    AS sucursal_destino_nombre,
             -- Movimiento
             m.tipo        AS movimiento_tipo,
             m.descripcion AS movimiento_descripcion,
             m.monto_ars   AS movimiento_monto_ars
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta v ON v.operacion_id = o.id
      LEFT JOIN public.compra c ON c.operacion_id = o.id
      LEFT JOIN public.proveedor prov ON prov.id = c.proveedor_id
      LEFT JOIN public.traslado t ON t.operacion_id = o.id
      LEFT JOIN public.sucursal s_dest ON s_dest.id = t.sucursal_destino_id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE o.tenant_id = $1 AND o.id = $2
    `;

    const { rows: opRows } = await pool.query(opQuery, [tenantId, id]);
    if (!opRows[0]) return null;

    const op = opRows[0];

    const itemsQuery = `
      SELECT 
        od.id,
        od.operacion_id,
        od.producto_sucursal_id,
        od.cantidad,
        od.alicuota_iva,
        od.iva_ars,
        od.precio_unit_ars,
        od.costo_unit_ars,
        p.id AS producto_id,
        p.codigo AS producto_codigo,
        p.nombre AS producto_nombre,
        p.marca AS producto_marca,
        p.modelo AS producto_modelo,
        p.imagen_url AS producto_imagen_url
      FROM public.operacion_detalle od
      JOIN public.producto_sucursal ps ON ps.id = od.producto_sucursal_id
      JOIN public.producto p ON p.id = ps.producto_id
      WHERE od.operacion_id = $1
      ORDER BY p.nombre
    `;

    const cuentasQuery = `
      SELECT 
        oc.id,
        oc.operacion_id,
        oc.cuenta_financiera_id,
        oc.porcentaje_venta,
        oc.porcentaje_extra,
        oc.monto_ars,
        oc.monto_usd,
        cf.nombre AS cuenta_nombre
      FROM public.operacion_cuenta oc
      JOIN public.cuenta_financiera cf ON cf.id = oc.cuenta_financiera_id
      WHERE oc.operacion_id = $1
      ORDER BY cf.nombre
    `;

    const [{ rows: items }, { rows: cuentas }] = await Promise.all([
      pool.query(itemsQuery, [id]),
      pool.query(cuentasQuery, [id]),
    ]);

    return {
      ...op,
      items,
      cuentas,
    };
  }
}
