import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { withTransaction } from '../utils/db-transaction';
import { BusinessError, ConflictError } from '../utils/errors';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';
import { ModoReparto, CuentaRepartoResuelta, ResultadoReparto, resolverReparto } from '../utils/reparto-cuentas';

export interface OperacionFiltros {
  tipo?: string;
  sucursal?: string;
  usuario?: string;
  estado?: 'activas' | 'canceladas' | 'todas';
}

const SORTABLE_COLUMNS: Record<string, string> = {
  tipo: 'to2.nombre',
  sucursal: 's.nombre',
  usuario: 'u.nombre',
  monto: 'COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0)',
  fecha: 'o.fecha',
};

export interface OperacionItemInput {
  producto_sucursal_id: string;
  cantidad: number;
  cantidad_impactada_stock?: number;
  precio_unit_ars?: number | null;
  precio_unit_usd?: number | null;
  costo_unit_ars?: number | null;
  costo_unit_usd?: number | null;
  alicuota_iva?: number | null;
  iva_ars?: number | null;
  iva_usd?: number | null;
}

export interface OperacionCuentaInput {
  cuenta_financiera_id: string;
  porcentaje_venta?: number | null;
  porcentaje_extra?: number | null;
  monto_ars?: number | null;
  monto_usd?: number | null;
}

export interface OperacionCrearData {
  tipo: 'Compra' | 'Venta' | 'Traslado' | 'Movimiento';
  sucursal_id: string;
  fecha?: string;
  /** Solo aplica a compras y ventas. Si se omite, se infiere de las cuentas recibidas. */
  registrar_finanzas_ahora?: boolean;
  /** Solo aplica a compras y ventas. Por compatibilidad, se impacta al crear si se omite. */
  impactar_stock_ahora?: boolean;
  /** Cómo se reparte el total entre las cuentas. Default: 'monto'. */
  modo_reparto?: ModoReparto;
  items?: OperacionItemInput[];
  cuentas?: OperacionCuentaInput[];
  compra?: {
    proveedor_id: string;
    numero_remito?: string | null;
    numero_factura?: string | null;
    subtotal_ars?: number | null;
    subtotal_usd?: number | null;
    otros_impuestos_ars?: number | null;
    otros_impuestos_usd?: number | null;
    total_ars?: number | null;
    total_usd?: number | null;
  };
  venta?: {
    numero_comprobante?: string | null;
    subtotal_ars?: number | null;
    subtotal_usd?: number | null;
    descuento_ars?: number | null;
    descuento_usd?: number | null;
    total_ars?: number | null;
    total_usd?: number | null;
  };
  traslado?: {
    sucursal_destino_id: string;
    costo_flete_ars?: number | null;
  };
  movimiento?: {
    tipo: 'ingreso' | 'egreso';
    descripcion?: string | null;
    monto_ars: number;
    monto_usd?: number | null;
  };
}

export interface RegistrarPagoData {
  cuentas: Array<OperacionCuentaInput & {
    fecha_efectiva?: string;
    observacion?: string | null;
  }>;
  fecha_efectiva?: string;
  observacion?: string | null;
}

export interface RegistrarImpactoStockData {
  items: Array<{
    operacion_detalle_id: string;
    cantidad: number;
  }>;
}

export type EstadoFinanciero = 'PENDIENTE' | 'PARCIAL' | 'SALDADA' | 'SOBREPAGADA';
export type EstadoStock = 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';

const TOLERANCIA_FINANCIERA = 0.01;

function redondearMonto(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularEstadoFinanciero(total: number, acumulado: number): EstadoFinanciero {
  if (acumulado <= TOLERANCIA_FINANCIERA) return 'PENDIENTE';
  if (acumulado < total - TOLERANCIA_FINANCIERA) return 'PARCIAL';
  if (acumulado <= total + TOLERANCIA_FINANCIERA) return 'SALDADA';
  return 'SOBREPAGADA';
}

export function calcularEstadoStock(
  items: Array<{ cantidad: unknown; cantidad_impactada_stock: unknown }>
): EstadoStock | null {
  if (items.length === 0) return null;
  if (items.every((item) => Number(item.cantidad_impactada_stock) === 0)) return 'PENDIENTE';
  if (items.every((item) => Number(item.cantidad_impactada_stock) === Number(item.cantidad))) return 'COMPLETO';
  return 'PARCIAL';
}

const ESTADO_STOCK_SQL = `
  CASE
    WHEN to2.nombre NOT IN ('Compra', 'Venta') THEN NULL
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.operacion_detalle od_stock
      WHERE od_stock.operacion_id = o.id
        AND od_stock.cantidad_impactada_stock > 0
    ) THEN 'PENDIENTE'
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.operacion_detalle od_stock
      WHERE od_stock.operacion_id = o.id
        AND od_stock.cantidad_impactada_stock < od_stock.cantidad
    ) THEN 'COMPLETO'
    ELSE 'PARCIAL'
  END AS estado_stock`;

export class OperacionRepository {
  async findAll(tenantId: string, sucursalId?: string, tipoId?: string, estado: OperacionFiltros['estado'] = 'activas') {
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
    const estadoClause = this.buildEstadoClause(estado);
    const query = `
      SELECT o.*,
             to2.nombre     AS tipo_nombre,
             u.nombre       AS usuario_nombre,
             s.nombre       AS sucursal_nombre,
             us.sucursal_id AS sucursal_id,
             COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto,
             ${ESTADO_STOCK_SQL}
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta      v ON v.operacion_id = o.id
      LEFT JOIN public.compra     c ON c.operacion_id = o.id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE o.tenant_id = $1 ${estadoClause} ${sucursalClause} ${tipoClause}
      ORDER BY o.fecha DESC
    `;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string, tipoId?: string, estado: OperacionFiltros['estado'] = 'activas') {
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
    const estadoClause = this.buildEstadoClause(estado);
    const { rows } = await pool.query(
      `SELECT o.*,
              to2.nombre     AS tipo_nombre,
              u.nombre       AS usuario_nombre,
              s.nombre       AS sucursal_nombre,
              us.sucursal_id AS sucursal_id,
              COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto,
              ${ESTADO_STOCK_SQL}
       FROM public.operacion o
       JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
       JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
       JOIN public.usuario           u  ON u.id   = us.usuario_id
       JOIN public.sucursal          s  ON s.id   = us.sucursal_id
       LEFT JOIN public.venta      v ON v.operacion_id = o.id
       LEFT JOIN public.compra     c ON c.operacion_id = o.id
       LEFT JOIN public.movimiento m ON m.operacion_id = o.id
       WHERE o.tenant_id = $1 ${estadoClause} ${sucursalClause} ${tipoClause}
       ORDER BY o.fecha DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }

  async findPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    sucursalId?: string,
    tipoId?: string,
    filtros?: OperacionFiltros,
    sortBy?: string,
    sortDir?: string,
    estado: OperacionFiltros['estado'] = 'activas'
  ) {
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
    const estadoClause = this.buildEstadoClause(estado);

    const filterClauses: string[] = [];
    if (filtros?.tipo) {
      params.push(filtros.tipo);
      filterClauses.push(`to2.nombre = $${params.length}`);
    }
    if (filtros?.sucursal) {
      params.push(filtros.sucursal);
      filterClauses.push(`s.nombre = $${params.length}`);
    }
    if (filtros?.usuario) {
      params.push(`%${filtros.usuario}%`);
      filterClauses.push(`u.nombre ILIKE $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'o.fecha DESC');

    const countQuery = `
      SELECT COUNT(*) FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta      v ON v.operacion_id = o.id
      LEFT JOIN public.compra     c ON c.operacion_id = o.id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE o.tenant_id = $1 ${estadoClause} ${sucursalClause} ${tipoClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT o.*,
             to2.nombre     AS tipo_nombre,
             u.nombre       AS usuario_nombre,
             s.nombre       AS sucursal_nombre,
             us.sucursal_id AS sucursal_id,
             COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto,
             ${ESTADO_STOCK_SQL}
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta      v ON v.operacion_id = o.id
      LEFT JOIN public.compra     c ON c.operacion_id = o.id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE o.tenant_id = $1 ${estadoClause} ${sucursalClause} ${tipoClause} ${filtersSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, dataParams),
    ]);

    return {
      items: dataResult.rows,
      total: Number(countResult.rows[0].count),
    };
  }

  async findValoresUnicos(tenantId: string, campo: string): Promise<string[]> {
    if (campo === 'tipo') {
      const { rows } = await pool.query(
        `SELECT DISTINCT to2.nombre AS valor
         FROM public.operacion o
         JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
         WHERE o.tenant_id = $1 AND to2.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'sucursal') {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.nombre AS valor
         FROM public.operacion o
         JOIN public.usuario_sucursal us ON us.id = o.usuario_sucursal_id
         JOIN public.sucursal s ON s.id = us.sucursal_id
         WHERE o.tenant_id = $1 AND s.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'usuario') {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.nombre AS valor
         FROM public.operacion o
         JOIN public.usuario_sucursal us ON us.id = o.usuario_sucursal_id
         JOIN public.usuario u ON u.id = us.usuario_id
         WHERE o.tenant_id = $1 AND u.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    return [];
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
         od.cantidad_impactada_stock,
         od.ultima_modificacion_stock_at,
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
        oc.fecha_efectiva,
        oc.observacion,
        cf.nombre AS cuenta_nombre
      FROM public.operacion_cuenta oc
      JOIN public.cuenta_financiera cf ON cf.id = oc.cuenta_financiera_id
      WHERE oc.operacion_id = $1
      ORDER BY oc.fecha_efectiva ASC, cf.nombre ASC
    `;

    const [{ rows: items }, { rows: cuentas }] = await Promise.all([
      pool.query(itemsQuery, [id]),
      pool.query(cuentasQuery, [id]),
    ]);

    return {
      ...op,
      estado_stock: op.tipo_nombre === 'Compra' || op.tipo_nombre === 'Venta'
        ? calcularEstadoStock(items)
        : null,
      items,
      cuentas,
      monto_pagado_ars: redondearMonto(
        cuentas.reduce((sum, cuenta) => sum + Number(cuenta.monto_ars ?? 0), 0)
      ),
    };
  }

  async crear(tenantId: string, authId: string, data: OperacionCrearData) {
    const operacionId = await withTransaction(async (client) => {
      const usuarioSucursalId = await this.resolverUsuarioSucursal(client, tenantId, authId, data.sucursal_id);
      const tipoId = await this.resolverTipoId(client, data.tipo);
      const esOperacionComercial = data.tipo === 'Compra' || data.tipo === 'Venta';
      const registrarFinanzasAhora = !esOperacionComercial
        || data.registrar_finanzas_ahora === true
        || (data.registrar_finanzas_ahora === undefined && (data.cuentas?.length ?? 0) > 0);

      // El reparto entre cuentas se resuelve antes de insertar nada: define los
      // montos reales de cada cuenta y el total de la operación (con recargos).
      const reparto = registrarFinanzasAhora
        ? await this.resolverRepartoCuentas(client, tenantId, data)
        : null;
      const estadoFinanciero: EstadoFinanciero | null = esOperacionComercial
        ? (registrarFinanzasAhora ? 'SALDADA' : 'PENDIENTE')
        : null;

      const { rows: opRows } = await client.query(
        `INSERT INTO public.operacion (tenant_id, usuario_sucursal_id, tipo_id, fecha, estado_financiero)
         VALUES ($1, $2, $3, COALESCE($4, NOW()), $5)
         RETURNING id`,
        [tenantId, usuarioSucursalId, tipoId, data.fecha ?? null, estadoFinanciero]
      );
      const id = opRows[0].id as string;

      const itemsConImpactoInicial = (data.items ?? []).map((item) => ({
        ...item,
        cantidad_impactada_stock: esOperacionComercial
          ? item.cantidad_impactada_stock ?? (data.impactar_stock_ahora === false ? 0 : item.cantidad)
          : 0,
      }));
      const itemsAImpactarAhora = itemsConImpactoInicial
        .filter((item) => Number(item.cantidad_impactada_stock) > 0)
        .map((item) => ({ ...item, cantidad: Number(item.cantidad_impactada_stock) }));

      if (itemsConImpactoInicial.length > 0) {
        await this.insertDetalle(client, id, itemsConImpactoInicial, esOperacionComercial);
      }

      await this.insertExtension(client, id, data, reparto);

      if (reparto && reparto.cuentas.length > 0) {
        await this.insertCuentas(client, id, reparto.cuentas, data.fecha, null);
      }

      const cuentasResueltas = reparto?.cuentas ?? [];

      switch (data.tipo) {
        case 'Compra':
          await this.ajustarStockCompra(client, itemsAImpactarAhora);
          await this.ajustarSaldos(client, cuentasResueltas, 'debito');
          break;
        case 'Venta':
          await this.validarMargenMinimo(client, data.items ?? []);
          await this.ajustarStockVenta(client, itemsAImpactarAhora);
          await this.ajustarSaldos(client, cuentasResueltas, 'credito');
          break;
        case 'Traslado':
          await this.ajustarStockTraslado(client, data.items ?? [], data.traslado!.sucursal_destino_id);
          if (data.traslado?.costo_flete_ars) {
            await this.ajustarSaldos(client, cuentasResueltas, 'debito');
          }
          break;
        case 'Movimiento': {
          const direccion = data.movimiento!.tipo === 'ingreso' ? 'credito' : 'debito';
          await this.ajustarSaldos(client, cuentasResueltas, direccion);
          break;
        }
      }

      return id;
    });

    return this.findById(tenantId, operacionId);
  }

  async cancelar(tenantId: string, authId: string, id: string) {
    await withTransaction(async (client) => {
      const { rows: opRows } = await client.query(
        `SELECT o.id, o.cancelled_at, to2.nombre AS tipo_nombre, us.sucursal_id
         FROM public.operacion o
         JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
         JOIN public.usuario_sucursal us ON us.id = o.usuario_sucursal_id
         WHERE o.id = $1 AND o.tenant_id = $2
         FOR UPDATE`,
        [id, tenantId]
      );
      const operacion = opRows[0];
      if (!operacion) throw new BusinessError('Operación no encontrada');
      if (operacion.cancelled_at) throw new ConflictError('La operación ya fue cancelada.');

      const canceladorId = await this.resolverUsuarioSucursal(
        client, tenantId, authId, operacion.sucursal_id as string
      );
      const { rows: detalleRows } = await client.query(
        `SELECT od.producto_sucursal_id, od.cantidad, od.cantidad_impactada_stock, ps.producto_id
         FROM public.operacion_detalle od
         JOIN public.producto_sucursal ps ON ps.id = od.producto_sucursal_id
         WHERE od.operacion_id = $1
         FOR UPDATE`,
        [id]
      );
      const { rows: cuentaRows } = await client.query(
        `SELECT cuenta_financiera_id, monto_ars
         FROM public.operacion_cuenta
         WHERE operacion_id = $1
         FOR UPDATE`,
        [id]
      );
      const cuentas = cuentaRows.map((row) => ({
        cuenta_financiera_id: row.cuenta_financiera_id as string,
        monto_ars: Number(row.monto_ars),
      }));
      const detallesStock = detalleRows
        .map((detalle) => ({
          ...detalle,
          cantidad: operacion.tipo_nombre === 'Compra' || operacion.tipo_nombre === 'Venta'
            ? detalle.cantidad_impactada_stock
            : detalle.cantidad,
        }))
        .filter((detalle) => Number(detalle.cantidad) > 0);

      switch (operacion.tipo_nombre) {
        case 'Compra':
          await this.revertirCompra(client, detallesStock);
          await this.ajustarSaldos(client, cuentas, 'credito');
          break;
        case 'Venta':
          await this.revertirVenta(client, detallesStock);
          await this.ajustarSaldos(client, cuentas, 'debito');
          break;
        case 'Traslado': {
          const { rows: trasladoRows } = await client.query(
            'SELECT sucursal_destino_id FROM public.traslado WHERE operacion_id = $1',
            [id]
          );
          if (!trasladoRows[0]) throw new BusinessError('No se encontró el destino del traslado.');
          await this.revertirTraslado(client, detalleRows, trasladoRows[0].sucursal_destino_id as string);
          // Si hay cuentas persistidas, hubo un importe financiero que revertir.
          await this.ajustarSaldos(client, cuentas, 'credito');
          break;
        }
        case 'Movimiento': {
          const { rows: movimientoRows } = await client.query(
            'SELECT tipo FROM public.movimiento WHERE operacion_id = $1',
            [id]
          );
          if (!movimientoRows[0]) throw new BusinessError('No se encontró el detalle del movimiento.');
          await this.ajustarSaldos(client, cuentas, movimientoRows[0].tipo === 'ingreso' ? 'debito' : 'credito');
          break;
        }
        default:
          throw new BusinessError(`La cancelación aún no está definida para ${operacion.tipo_nombre}.`);
      }

      await client.query(
        `UPDATE public.operacion
         SET cancelled_at = NOW(), cancelled_by_usuario_sucursal_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, canceladorId]
      );
    });
    return this.findById(tenantId, id);
  }

  async registrarImpactoStock(tenantId: string, id: string, data: RegistrarImpactoStockData) {
    await withTransaction(async (client) => {
      const idsDetalle = data.items.map((item) => item.operacion_detalle_id);
      if (new Set(idsDetalle).size !== idsDetalle.length) {
        throw new BusinessError('No se puede impactar la misma línea más de una vez en una sola solicitud.');
      }

      const { rows: operacionRows } = await client.query(
        `SELECT o.id, o.cancelled_at, to2.nombre AS tipo_nombre
         FROM public.operacion o
         JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
         WHERE o.id = $1 AND o.tenant_id = $2
         FOR UPDATE OF o`,
        [id, tenantId]
      );
      const operacion = operacionRows[0];
      if (!operacion) throw new BusinessError('Operación no encontrada');
      if (operacion.cancelled_at) throw new ConflictError('No se puede impactar stock en una operación cancelada.');
      if (operacion.tipo_nombre !== 'Compra' && operacion.tipo_nombre !== 'Venta') {
        throw new BusinessError('Solo las compras y ventas admiten impactos parciales de stock.');
      }

      const { rows: detalles } = await client.query(
        `SELECT od.id, od.producto_sucursal_id, od.cantidad, od.cantidad_impactada_stock,
                p.nombre AS producto_nombre
         FROM public.operacion_detalle od
         JOIN public.producto_sucursal ps ON ps.id = od.producto_sucursal_id
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE od.operacion_id = $1 AND od.id = ANY($2::uuid[])
         ORDER BY od.id
         FOR UPDATE OF od`,
        [id, idsDetalle]
      );
      if (detalles.length !== idsDetalle.length) {
        throw new BusinessError('Alguna de las líneas indicadas no pertenece a la operación.');
      }

      const cantidadPorDetalle = new Map(data.items.map((item) => [item.operacion_detalle_id, item.cantidad]));
      for (const detalle of detalles) {
        const nuevaCantidad = cantidadPorDetalle.get(detalle.id as string)!;
        const pendiente = Number(detalle.cantidad) - Number(detalle.cantidad_impactada_stock);
        if (!Number.isInteger(nuevaCantidad) || nuevaCantidad <= 0 || nuevaCantidad > pendiente) {
          throw new BusinessError(
            `La cantidad a impactar de ${detalle.producto_nombre} debe ser un entero mayor a cero y no superar las ${pendiente} unidades pendientes.`
          );
        }
      }

      const cantidadesPorStock = new Map<string, number>();
      for (const detalle of detalles) {
        const stockId = detalle.producto_sucursal_id as string;
        const cantidad = cantidadPorDetalle.get(detalle.id as string)!;
        cantidadesPorStock.set(stockId, (cantidadesPorStock.get(stockId) ?? 0) + cantidad);
      }
      const idsStock = [...cantidadesPorStock.keys()].sort();
      const { rows: stocks } = await client.query(
        `SELECT ps.id, ps.cantidad_disponible, p.nombre AS producto_nombre
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE ps.id = ANY($1::uuid[])
         ORDER BY ps.id
         FOR UPDATE`,
        [idsStock]
      );
      if (stocks.length !== idsStock.length) {
        throw new BusinessError('No se encontró el stock de alguna línea de la operación.');
      }
      if (operacion.tipo_nombre === 'Venta') {
        for (const stock of stocks) {
          const cantidad = cantidadesPorStock.get(stock.id as string)!;
          if (Number(stock.cantidad_disponible) < cantidad) {
            throw new BusinessError(
              `Stock insuficiente para registrar la salida de ${stock.producto_nombre}: hay ${stock.cantidad_disponible} y se solicitan ${cantidad}.`
            );
          }
        }
      }

      for (const detalle of detalles) {
        const cantidad = cantidadPorDetalle.get(detalle.id as string)!;
        const resultado = await client.query(
          `UPDATE public.operacion_detalle
           SET cantidad_impactada_stock = cantidad_impactada_stock + $1,
               ultima_modificacion_stock_at = NOW()
           WHERE id = $2
             AND cantidad_impactada_stock + $1 <= cantidad`,
          [cantidad, detalle.id]
        );
        if (resultado.rowCount !== 1) {
          throw new ConflictError('La operación cambió mientras se registraba el impacto. Actualizá el detalle e intentá nuevamente.');
        }
      }

      const signo = operacion.tipo_nombre === 'Compra' ? 1 : -1;
      for (const stockId of idsStock) {
        await client.query(
          `UPDATE public.producto_sucursal
           SET cantidad_disponible = cantidad_disponible + $1, updated_at = NOW()
           WHERE id = $2`,
          [signo * cantidadesPorStock.get(stockId)!, stockId]
        );
      }
    });
    return this.findById(tenantId, id);
  }

  async registrarPago(tenantId: string, id: string, data: RegistrarPagoData) {
    await withTransaction(async (client) => {
      const { rows: opRows } = await client.query(
        `SELECT o.id, o.cancelled_at, o.estado_financiero, to2.nombre AS tipo_nombre,
                COALESCE(c.total_ars, v.total_ars) AS total_ars
         FROM public.operacion o
         JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
         LEFT JOIN public.compra c ON c.operacion_id = o.id
         LEFT JOIN public.venta v ON v.operacion_id = o.id
         WHERE o.id = $1 AND o.tenant_id = $2
         FOR UPDATE OF o`,
        [id, tenantId]
      );
      const operacion = opRows[0];
      if (!operacion) throw new BusinessError('Operación no encontrada');
      if (operacion.cancelled_at) throw new ConflictError('No se puede registrar un pago/cobro en una operación cancelada.');
      if (operacion.tipo_nombre !== 'Compra' && operacion.tipo_nombre !== 'Venta') {
        throw new BusinessError('Solo las compras y ventas admiten pagos/cobros asociados.');
      }
      if (operacion.estado_financiero === 'SALDADA' || operacion.estado_financiero === 'SOBREPAGADA') {
        throw new ConflictError('La operación ya está saldada y no admite otro pago/cobro.');
      }

      const total = Number(operacion.total_ars ?? 0);
      if (!(total > 0)) throw new BusinessError('La operación no tiene un total válido para registrar el pago/cobro.');

      const { rows: pagosPrevios } = await client.query(
        `SELECT monto_ars
         FROM public.operacion_cuenta
         WHERE operacion_id = $1
         FOR UPDATE`,
        [id]
      );
      const acumuladoAnterior = redondearMonto(
        pagosPrevios.reduce((sum, pago) => sum + Number(pago.monto_ars ?? 0), 0)
      );
      const pago = await this.resolverPagoParcial(client, tenantId, total, data.cuentas);
      for (const [index, cuenta] of pago.cuentas.entries()) {
        const detalle = data.cuentas[index];
        await this.insertCuentas(
          client,
          id,
          [cuenta],
          detalle?.fecha_efectiva ?? data.fecha_efectiva,
          detalle?.observacion ?? data.observacion
        );
      }
      await this.ajustarSaldos(
        client,
        pago.cuentas,
        operacion.tipo_nombre === 'Compra' ? 'debito' : 'credito'
      );

      const acumulado = redondearMonto(acumuladoAnterior + pago.total);
      const estadoFinanciero = calcularEstadoFinanciero(total, acumulado);
      await client.query(
        `UPDATE public.operacion
         SET estado_financiero = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, estadoFinanciero]
      );
    });
    return this.findById(tenantId, id);
  }

  async eliminarPago(tenantId: string, id: string, pagoId: string) {
    await withTransaction(async (client) => {
      const { rows: opRows } = await client.query(
        `SELECT o.id, o.cancelled_at, to2.nombre AS tipo_nombre,
                COALESCE(c.total_ars, v.total_ars) AS total_ars
         FROM public.operacion o
         JOIN public.tipo_operacion to2 ON to2.id = o.tipo_id
         LEFT JOIN public.compra c ON c.operacion_id = o.id
         LEFT JOIN public.venta v ON v.operacion_id = o.id
         WHERE o.id = $1 AND o.tenant_id = $2
         FOR UPDATE OF o`,
        [id, tenantId]
      );
      const operacion = opRows[0];
      if (!operacion) throw new BusinessError('Operación no encontrada');
      if (operacion.cancelled_at) {
        throw new ConflictError('No se puede eliminar un pago/cobro de una operación cancelada.');
      }
      if (operacion.tipo_nombre !== 'Compra' && operacion.tipo_nombre !== 'Venta') {
        throw new BusinessError('Solo las compras y ventas admiten pagos/cobros asociados.');
      }

      // Bloquear el historial completo junto con la operación evita que un alta o
      // una baja concurrente calcule un estado financiero desactualizado.
      const { rows: pagos } = await client.query(
        `SELECT id, cuenta_financiera_id, monto_ars
         FROM public.operacion_cuenta
         WHERE operacion_id = $1
         FOR UPDATE`,
        [id]
      );
      const pago = pagos.find((item) => item.id === pagoId);
      if (!pago) throw new BusinessError('Pago/cobro no encontrado');

      const monto = Number(pago.monto_ars ?? 0);
      if (!(monto > 0)) throw new BusinessError('El pago/cobro no tiene un monto válido para eliminar.');

      await this.ajustarSaldos(
        client,
        [{ cuenta_financiera_id: pago.cuenta_financiera_id, monto_ars: monto }],
        operacion.tipo_nombre === 'Compra' ? 'credito' : 'debito'
      );
      await client.query(
        `DELETE FROM public.operacion_cuenta
         WHERE id = $1 AND operacion_id = $2`,
        [pagoId, id]
      );

      const acumuladoRestante = redondearMonto(
        pagos
          .filter((item) => item.id !== pagoId)
          .reduce((sum, item) => sum + Number(item.monto_ars ?? 0), 0)
      );
      const estadoFinanciero = calcularEstadoFinanciero(Number(operacion.total_ars ?? 0), acumuladoRestante);
      await client.query(
        `UPDATE public.operacion
         SET estado_financiero = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, estadoFinanciero]
      );
    });
    return this.findById(tenantId, id);
  }

  private buildEstadoClause(estado: OperacionFiltros['estado']): string {
    if (estado === 'canceladas') return 'AND o.cancelled_at IS NOT NULL';
    if (estado === 'todas') return '';
    return 'AND o.cancelled_at IS NULL';
  }

  private async revertirCompra(client: PoolClient, items: Array<{ producto_sucursal_id: string; cantidad: unknown }>) {
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      const { rows } = await client.query(
        `SELECT ps.cantidad_disponible, p.nombre
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE ps.id = $1 FOR UPDATE`,
        [item.producto_sucursal_id]
      );
      if (!rows[0] || Number(rows[0].cantidad_disponible) < cantidad) {
        throw new BusinessError(`No se puede cancelar la compra: el stock de ${rows[0]?.nombre ?? item.producto_sucursal_id} ya fue utilizado.`);
      }
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2',
        [cantidad, item.producto_sucursal_id]
      );
    }
  }

  private async revertirVenta(client: PoolClient, items: Array<{ producto_sucursal_id: string; cantidad: unknown }>) {
    for (const item of items) {
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2',
        [Number(item.cantidad), item.producto_sucursal_id]
      );
    }
  }

  private async revertirTraslado(
    client: PoolClient,
    items: Array<{ producto_sucursal_id: string; cantidad: unknown; producto_id: string }>,
    sucursalDestinoId: string
  ) {
    for (const item of items) {
      const { rows: destinoRows } = await client.query(
        `SELECT ps.id, ps.cantidad_disponible, p.nombre
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE ps.producto_id = $1 AND ps.sucursal_id = $2
         FOR UPDATE`,
        [item.producto_id, sucursalDestinoId]
      );
      const destino = destinoRows[0];
      const cantidad = Number(item.cantidad);
      if (!destino || Number(destino.cantidad_disponible) < cantidad) {
        throw new BusinessError(`No se puede cancelar el traslado: el stock de ${destino?.nombre ?? item.producto_id} ya fue utilizado en destino.`);
      }
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2',
        [cantidad, destino.id]
      );
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2',
        [cantidad, item.producto_sucursal_id]
      );
    }
  }

  /**
   * Resuelve el reparto de la operación entre sus cuentas financieras.
   *
   * El `porcentaje_extra` se lee siempre de `cuenta_financiera` en la base y
   * nunca del input, para que el cliente no pueda falsear un recargo.
   *
   * La base sobre la que se reparte depende del tipo de operación:
   *  - Venta/Compra: el subtotal declarado de la operación.
   *  - Movimiento: no hay base previa; el monto surge de las propias cuentas,
   *    así que se reparte por monto contra la suma de lo cargado.
   *  - Traslado: solo el costo del flete, si lo hay.
   */
  private async resolverRepartoCuentas(
    client: PoolClient,
    tenantId: string,
    data: OperacionCrearData
  ) {
    const cuentas = data.cuentas ?? [];
    if (cuentas.length === 0) return null;

    const ids = [...new Set(cuentas.map((c) => c.cuenta_financiera_id))];
    const { rows } = await client.query(
      `SELECT id, porcentaje_extra FROM public.cuenta_financiera
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId]
    );
    if (rows.length !== ids.length) {
      throw new BusinessError('Alguna de las cuentas financieras indicadas no existe');
    }
    const extraPorCuenta = new Map<string, number>(
      rows.map((r) => [r.id as string, r.porcentaje_extra !== null ? Number(r.porcentaje_extra) : 0])
    );

    const modo: ModoReparto = data.modo_reparto ?? 'monto';
    const base = this.calcularBaseReparto(data, cuentas, extraPorCuenta, modo);

    return resolverReparto(modo, base, cuentas, extraPorCuenta);
  }

  private async resolverPagoParcial(
    client: PoolClient,
    tenantId: string,
    totalOperacion: number,
    cuentas: OperacionCuentaInput[]
  ): Promise<{ cuentas: CuentaRepartoResuelta[]; total: number }> {
    if (cuentas.length === 0) {
      throw new BusinessError('Indicá al menos una cuenta financiera para registrar el pago/cobro.');
    }
    const ids = [...new Set(cuentas.map((cuenta) => cuenta.cuenta_financiera_id))];
    const { rows } = await client.query(
      `SELECT id, porcentaje_extra
       FROM public.cuenta_financiera
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [ids, tenantId]
    );
    if (rows.length !== ids.length) {
      throw new BusinessError('Alguna de las cuentas financieras indicadas no existe.');
    }
    const extraPorCuenta = new Map<string, number>(
      rows.map((row) => [row.id as string, Number(row.porcentaje_extra ?? 0)])
    );
    const cuentasResueltas = cuentas.map((cuenta) => {
      const monto = redondearMonto(Number(cuenta.monto_ars ?? 0));
      if (!(monto > 0)) throw new BusinessError('Cada pago/cobro debe tener un monto mayor a cero.');
      const porcentajeExtra = extraPorCuenta.get(cuenta.cuenta_financiera_id) ?? 0;
      const base = redondearMonto(monto / (1 + porcentajeExtra / 100));
      return {
        cuenta_financiera_id: cuenta.cuenta_financiera_id,
        porcentaje_venta: totalOperacion > 0 ? redondearMonto((base / totalOperacion) * 100) : 0,
        porcentaje_extra: porcentajeExtra,
        base_ars: base,
        monto_ars: monto,
        monto_usd: cuenta.monto_usd ?? null,
      };
    });
    return {
      cuentas: cuentasResueltas,
      total: redondearMonto(cuentasResueltas.reduce((sum, cuenta) => sum + cuenta.monto_ars, 0)),
    };
  }

  /** Base (sin recargos) sobre la que se reparte, según el tipo de operación. */
  private calcularBaseReparto(
    data: OperacionCrearData,
    cuentas: OperacionCuentaInput[],
    extraPorCuenta: Map<string, number>,
    modo: ModoReparto
  ): number {
    if (data.tipo === 'Movimiento') {
      // El monto del movimiento se deriva de las cuentas, no al revés.
      return cuentas.reduce((acc, c) => {
        const extra = extraPorCuenta.get(c.cuenta_financiera_id) ?? 0;
        return acc + Number(c.monto_ars ?? 0) / (1 + extra / 100);
      }, 0);
    }
    if (data.tipo === 'Traslado') {
      return Number(data.traslado?.costo_flete_ars ?? 0);
    }
    if (data.tipo === 'Venta') {
      const subtotal = Number(data.venta?.subtotal_ars ?? 0);
      const descuento = Number(data.venta?.descuento_ars ?? 0);
      return subtotal - descuento;
    }
    const subtotalCompra = Number(data.compra?.subtotal_ars ?? 0);
    if (subtotalCompra > 0) return subtotalCompra;
    // Sin subtotal declarado, la base es la suma de los ítems: `total_ars` no
    // sirve porque ya trae los recargos de cada cuenta sumados.
    return (data.items ?? []).reduce(
      (acc, item) => acc + Number(item.cantidad ?? 0) * Number(item.costo_unit_ars ?? 0),
      0
    );
  }

  private async resolverUsuarioSucursal(
    client: PoolClient,
    tenantId: string,
    authId: string,
    sucursalId: string
  ): Promise<string> {
    const { rows } = await client.query(
      `SELECT us.id
       FROM public.usuario_sucursal us
       JOIN public.usuario u ON u.id = us.usuario_id
       WHERE u.auth_id = $1 AND us.sucursal_id = $2 AND u.tenant_id = $3
       LIMIT 1`,
      [authId, sucursalId, tenantId]
    );
    if (!rows[0]) {
      throw new BusinessError('El usuario no tiene acceso a la sucursal indicada');
    }
    return rows[0].id as string;
  }

  private async resolverTipoId(client: PoolClient, tipoNombre: string): Promise<string> {
    const { rows } = await client.query(
      'SELECT id FROM public.tipo_operacion WHERE nombre = $1 LIMIT 1',
      [tipoNombre]
    );
    if (!rows[0]) {
      throw new BusinessError(`Tipo de operación inválido: ${tipoNombre}`);
    }
    return rows[0].id as string;
  }

  private async insertDetalle(
    client: PoolClient,
    operacionId: string,
    items: OperacionItemInput[],
    esOperacionComercial: boolean
  ) {
    for (const item of items) {
      const cantidadImpactadaStock = esOperacionComercial
        ? Number(item.cantidad_impactada_stock ?? item.cantidad)
        : 0;
      await client.query(
        `INSERT INTO public.operacion_detalle
            (operacion_id, producto_sucursal_id, cantidad, cantidad_impactada_stock, ultima_modificacion_stock_at, alicuota_iva, iva_ars, iva_usd, precio_unit_ars, precio_unit_usd, costo_unit_ars, costo_unit_usd)
          VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN NOW() ELSE NULL END, $6, $7, $8, $9, $10, $11, $12)`,
        [
          operacionId,
          item.producto_sucursal_id,
          item.cantidad,
          cantidadImpactadaStock,
          cantidadImpactadaStock > 0,
          item.alicuota_iva ?? null,
          item.iva_ars ?? null,
          item.iva_usd ?? null,
          item.precio_unit_ars ?? null,
          item.precio_unit_usd ?? null,
          item.costo_unit_ars ?? null,
          item.costo_unit_usd ?? null,
        ]
      );
    }
  }

  private async insertExtension(
    client: PoolClient,
    operacionId: string,
    data: OperacionCrearData,
    reparto: ResultadoReparto | null
  ) {
    switch (data.tipo) {
      case 'Compra': {
        const c = data.compra!;
        await client.query(
          `INSERT INTO public.compra
             (operacion_id, proveedor_id, numero_remito, numero_factura, subtotal_ars, subtotal_usd, otros_impuestos_ars, otros_impuestos_usd, total_ars, total_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            operacionId, c.proveedor_id, c.numero_remito ?? null, c.numero_factura ?? null,
            c.subtotal_ars ?? null, c.subtotal_usd ?? null, c.otros_impuestos_ars ?? null, c.otros_impuestos_usd ?? null,
            c.total_ars ?? null, c.total_usd ?? null,
          ]
        );
        return;
      }
      case 'Venta': {
        const v = data.venta!;
        // El total real incluye los recargos de las cuentas usadas.
        const totalArs = reparto ? reparto.total : v.total_ars ?? null;
        await client.query(
          `INSERT INTO public.venta
             (operacion_id, numero_comprobante, subtotal_ars, subtotal_usd, descuento_ars, descuento_usd, total_ars, total_usd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            operacionId, v.numero_comprobante ?? null, v.subtotal_ars ?? null, v.subtotal_usd ?? null,
            v.descuento_ars ?? null, v.descuento_usd ?? null, totalArs, v.total_usd ?? null,
          ]
        );
        return;
      }
      case 'Traslado': {
        const t = data.traslado!;
        await client.query(
          `INSERT INTO public.traslado (operacion_id, sucursal_destino_id, traslado_id, costo_flete_ars)
           VALUES ($1, $2, NULL, $3)`,
          [operacionId, t.sucursal_destino_id, t.costo_flete_ars ?? null]
        );
        return;
      }
      case 'Movimiento': {
        const m = data.movimiento!;
        // El monto del movimiento es lo que efectivamente entra/sale de las cuentas.
        const montoArs = reparto ? reparto.total : m.monto_ars;
        await client.query(
          `INSERT INTO public.movimiento (operacion_id, tipo, descripcion, monto_ars, monto_usd)
           VALUES ($1, $2, $3, $4, $5)`,
          [operacionId, m.tipo, m.descripcion ?? null, montoArs, m.monto_usd ?? null]
        );
        return;
      }
    }
  }

  private async insertCuentas(
    client: PoolClient,
    operacionId: string,
    cuentas: CuentaRepartoResuelta[],
    fechaEfectiva?: string,
    observacion?: string | null
  ) {
    for (const cuenta of cuentas) {
      await client.query(
        `INSERT INTO public.operacion_cuenta
           (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, monto_usd, fecha_efectiva, observacion)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8)`,
        [
          operacionId, cuenta.cuenta_financiera_id, cuenta.porcentaje_venta,
          cuenta.porcentaje_extra, cuenta.monto_ars, cuenta.monto_usd ?? null,
          fechaEfectiva ?? null, observacion ?? null,
        ]
      );
    }
  }

  private async ajustarStockCompra(client: PoolClient, items: OperacionItemInput[]) {
    for (const item of items) {
      await client.query('SELECT id FROM public.producto_sucursal WHERE id = $1 FOR UPDATE', [item.producto_sucursal_id]);
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2',
        [item.cantidad, item.producto_sucursal_id]
      );
    }
  }

  /**
   * Regla de negocio: el precio de venta no puede quedar por debajo del margen
   * mínimo de utilidad configurado para el producto en esa sucursal.
   *
   *   precio_unit_ars >= costo_reposicion * (1 + margen_minimo / 100)
   *
   * Si el producto no tiene costo de reposición o margen mínimo cargados, no se
   * puede calcular el piso y el ítem no se valida.
   */
  private async validarMargenMinimo(client: PoolClient, items: OperacionItemInput[]) {
    for (const item of items) {
      const { rows } = await client.query(
        `SELECT ps.costo_reposicion, ps.margen_minimo, p.nombre
         FROM public.producto_sucursal ps
         JOIN public.producto p ON p.id = ps.producto_id
         WHERE ps.id = $1`,
        [item.producto_sucursal_id]
      );
      const fila = rows[0];
      if (!fila) continue; // ajustarStockVenta ya reporta el producto inexistente

      const costo = fila.costo_reposicion !== null ? Number(fila.costo_reposicion) : null;
      const margen = fila.margen_minimo !== null ? Number(fila.margen_minimo) : null;
      if (costo === null || margen === null || costo <= 0) continue;

      const precio = item.precio_unit_ars !== null && item.precio_unit_ars !== undefined
        ? Number(item.precio_unit_ars)
        : null;
      if (precio === null) continue;

      const precioMinimo = costo * (1 + margen / 100);
      // Tolerancia de un centavo para no rechazar por redondeo.
      if (precio < precioMinimo - 0.01) {
        throw new BusinessError(
          `El precio de "${fila.nombre}" ($${precio.toFixed(2)}) está por debajo del margen mínimo ` +
          `del ${margen}%. El precio mínimo permitido es $${precioMinimo.toFixed(2)}.`
        );
      }
    }
  }

  private async ajustarStockVenta(client: PoolClient, items: OperacionItemInput[]) {
    for (const item of items) {
      const { rows } = await client.query(
        'SELECT cantidad_disponible, producto_id FROM public.producto_sucursal WHERE id = $1 FOR UPDATE',
        [item.producto_sucursal_id]
      );
      if (!rows[0]) {
        throw new BusinessError(`El producto en stock ${item.producto_sucursal_id} no existe`);
      }
      // La venta se registra aunque no haya stock suficiente: el disponible
      // puede quedar negativo y se corrige con una compra o un ajuste manual.
      // El formulario avisa antes de registrar, pero no lo impide.
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2',
        [item.cantidad, item.producto_sucursal_id]
      );
    }
  }

  private async ajustarStockTraslado(client: PoolClient, items: OperacionItemInput[], sucursalDestinoId: string) {
    for (const item of items) {
      const { rows } = await client.query(
        'SELECT cantidad_disponible, producto_id FROM public.producto_sucursal WHERE id = $1 FOR UPDATE',
        [item.producto_sucursal_id]
      );
      if (!rows[0]) {
        throw new BusinessError(`El producto en stock ${item.producto_sucursal_id} no existe`);
      }
      if (rows[0].cantidad_disponible < item.cantidad) {
        const { rows: prodRows } = await client.query(
          'SELECT nombre FROM public.producto WHERE id = $1',
          [rows[0].producto_id]
        );
        const nombre = prodRows[0]?.nombre ?? rows[0].producto_id;
        throw new BusinessError(
          `Stock insuficiente para trasladar ${nombre}: hay ${rows[0].cantidad_disponible} y se piden ${item.cantidad}.`
        );
      }

      const { rows: destRows } = await client.query(
        'SELECT id FROM public.producto_sucursal WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE',
        [rows[0].producto_id, sucursalDestinoId]
      );
      if (!destRows[0]) {
        const { rows: prodRows } = await client.query('SELECT nombre FROM public.producto WHERE id = $1', [rows[0].producto_id]);
        const nombre = prodRows[0]?.nombre ?? rows[0].producto_id;
        throw new BusinessError(`El producto ${nombre} no está habilitado en la sucursal destino`);
      }

      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible - $1 WHERE id = $2',
        [item.cantidad, item.producto_sucursal_id]
      );
      await client.query(
        'UPDATE public.producto_sucursal SET cantidad_disponible = cantidad_disponible + $1 WHERE id = $2',
        [item.cantidad, destRows[0].id]
      );
    }
  }

  private async ajustarSaldos(
    client: PoolClient,
    cuentas: Array<Pick<CuentaRepartoResuelta, 'cuenta_financiera_id' | 'monto_ars'>>,
    direccion: 'debito' | 'credito'
  ) {
    const signo = direccion === 'debito' ? -1 : 1;
    for (const cuenta of cuentas) {
      await client.query('SELECT id FROM public.cuenta_financiera WHERE id = $1 FOR UPDATE', [cuenta.cuenta_financiera_id]);
      await client.query(
        'UPDATE public.cuenta_financiera SET saldo_actual = saldo_actual + $1 WHERE id = $2',
        [signo * cuenta.monto_ars, cuenta.cuenta_financiera_id]
      );
    }
  }
}
