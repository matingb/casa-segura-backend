import { pool } from '../config/db';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

export interface CuentaFinancieraFiltros {
  nombre?: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  nombre: 'nombre',
  saldoInicial: 'saldo_inicial',
  saldoActual: 'saldo_actual',
  porcentajeExtra: 'porcentaje_extra',
};

export class CuentaFinancieraRepository {
  async findAll(tenantId: string) {
    const query = 'SELECT * FROM public.cuenta_financiera WHERE tenant_id = $1 ORDER BY nombre';
    const { rows } = await pool.query(query, [tenantId]);
    return rows;
  }

  async findAllFiltradas(tenantId: string, filtros?: CuentaFinancieraFiltros, sortBy?: string, sortDir?: string) {
    const params: unknown[] = [tenantId];
    const filterClauses: string[] = [];
    if (filtros?.nombre) {
      params.push(`%${filtros.nombre}%`);
      filterClauses.push(`nombre ILIKE $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';
    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'nombre ASC');

    const query = `
      SELECT * FROM public.cuenta_financiera
      WHERE tenant_id = $1 ${filtersSql}
      ORDER BY ${orderBy}
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async findValoresUnicos(tenantId: string, campo: string): Promise<string[]> {
    const columnasPermitidas: Record<string, string> = {
      nombre: 'nombre',
    };
    const columna = columnasPermitidas[campo];
    if (!columna) return [];

    const { rows } = await pool.query(
      `SELECT DISTINCT ${columna} AS valor
       FROM public.cuenta_financiera
       WHERE tenant_id = $1 AND ${columna} IS NOT NULL AND ${columna} <> ''
       ORDER BY valor`,
      [tenantId]
    );
    return rows.map((r) => r.valor);
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

  async findMovimientos(tenantId: string, cuentaId: string) {
    const query = `
      SELECT 
        oc.id,
        oc.operacion_id,
        oc.cuenta_financiera_id,
        oc.porcentaje_venta,
        oc.porcentaje_extra,
        oc.monto_ars,
        oc.monto_usd,
        o.fecha,
        to2.nombre AS tipo_nombre,
        CASE
          WHEN to2.nombre = 'Venta' THEN 'ingreso'
          WHEN to2.nombre = 'Movimiento' THEN m.tipo
          ELSE 'egreso'
        END AS movimiento_tipo,
        u.nombre   AS usuario_nombre,
        s.nombre   AS sucursal_nombre,
        CASE 
          WHEN to2.nombre = 'Venta' THEN 
            'Venta en ' || s.nombre
          WHEN to2.nombre = 'Compra' THEN 
            'Compra a ' || COALESCE(prov.nombre, 'proveedor')
          WHEN to2.nombre = 'Traslado' THEN 
            'Traslado a ' || COALESCE(s_dest.nombre, 'sucursal')
          WHEN to2.nombre = 'Movimiento' THEN 
            COALESCE(m.descripcion, 'Movimiento manual')
          ELSE 
            to2.nombre
        END AS descripcion
      FROM public.operacion_cuenta oc
      JOIN public.cuenta_financiera cf ON cf.id = oc.cuenta_financiera_id
      JOIN public.operacion o ON o.id = oc.operacion_id
      JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
      LEFT JOIN public.usuario_sucursal us ON us.id = o.usuario_sucursal_id
      LEFT JOIN public.usuario u ON u.id = us.usuario_id
      LEFT JOIN public.sucursal s ON s.id = us.sucursal_id
      LEFT JOIN public.compra c ON c.operacion_id = o.id
      LEFT JOIN public.proveedor prov ON prov.id = c.proveedor_id
      LEFT JOIN public.traslado t ON t.operacion_id = o.id
      LEFT JOIN public.sucursal s_dest ON s_dest.id = t.sucursal_destino_id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE cf.tenant_id = $1 AND oc.cuenta_financiera_id = $2
      ORDER BY o.fecha DESC
    `;
    const { rows } = await pool.query(query, [tenantId, cuentaId]);
    return rows;
  }
}


