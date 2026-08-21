import { PoolClient } from 'pg';
import { pool } from '../config/db';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { withTransaction } from '../utils/db-transaction';
import { BusinessError } from '../utils/errors';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';
import { ModoReparto, CuentaRepartoResuelta, ResultadoReparto, resolverReparto } from '../utils/reparto-cuentas';

export interface OperacionFiltros {
  tipo?: string;
  sucursal?: string;
  usuario?: string;
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
             us.sucursal_id AS sucursal_id,
             COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta      v ON v.operacion_id = o.id
      LEFT JOIN public.compra     c ON c.operacion_id = o.id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
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
              us.sucursal_id AS sucursal_id,
              COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto
       FROM public.operacion o
       JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
       JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
       JOIN public.usuario           u  ON u.id   = us.usuario_id
       JOIN public.sucursal          s  ON s.id   = us.sucursal_id
       LEFT JOIN public.venta      v ON v.operacion_id = o.id
       LEFT JOIN public.compra     c ON c.operacion_id = o.id
       LEFT JOIN public.movimiento m ON m.operacion_id = o.id
       WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause}
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
    sortDir?: string
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
      WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT o.*,
             to2.nombre     AS tipo_nombre,
             u.nombre       AS usuario_nombre,
             s.nombre       AS sucursal_nombre,
             us.sucursal_id AS sucursal_id,
             COALESCE(v.total_ars, c.total_ars, m.monto_ars, 0) AS monto
      FROM public.operacion o
      JOIN public.tipo_operacion   to2 ON to2.id = o.tipo_id
      JOIN public.usuario_sucursal us  ON us.id  = o.usuario_sucursal_id
      JOIN public.usuario           u  ON u.id   = us.usuario_id
      JOIN public.sucursal          s  ON s.id   = us.sucursal_id
      LEFT JOIN public.venta      v ON v.operacion_id = o.id
      LEFT JOIN public.compra     c ON c.operacion_id = o.id
      LEFT JOIN public.movimiento m ON m.operacion_id = o.id
      WHERE o.tenant_id = $1 ${sucursalClause} ${tipoClause} ${filtersSql}
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

  async crear(tenantId: string, authId: string, data: OperacionCrearData) {
    const operacionId = await withTransaction(async (client) => {
      const usuarioSucursalId = await this.resolverUsuarioSucursal(client, tenantId, authId, data.sucursal_id);
      const tipoId = await this.resolverTipoId(client, data.tipo);

      // El reparto entre cuentas se resuelve antes de insertar nada: define los
      // montos reales de cada cuenta y el total de la operación (con recargos).
      const reparto = await this.resolverRepartoCuentas(client, tenantId, data);

      const { rows: opRows } = await client.query(
        `INSERT INTO public.operacion (tenant_id, usuario_sucursal_id, tipo_id, fecha)
         VALUES ($1, $2, $3, COALESCE($4, NOW()))
         RETURNING id`,
        [tenantId, usuarioSucursalId, tipoId, data.fecha ?? null]
      );
      const id = opRows[0].id as string;

      if (data.items && data.items.length > 0) {
        await this.insertDetalle(client, id, data.items);
      }

      await this.insertExtension(client, id, data, reparto);

      if (reparto && reparto.cuentas.length > 0) {
        await this.insertCuentas(client, id, reparto.cuentas);
      }

      const cuentasResueltas = reparto?.cuentas ?? [];

      switch (data.tipo) {
        case 'Compra':
          await this.ajustarStockCompra(client, data.items ?? []);
          await this.ajustarSaldos(client, cuentasResueltas, 'debito');
          break;
        case 'Venta':
          await this.validarMargenMinimo(client, data.items ?? []);
          await this.ajustarStockVenta(client, data.items ?? []);
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
    return Number(data.compra?.total_ars ?? data.compra?.subtotal_ars ?? 0);
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

  private async insertDetalle(client: PoolClient, operacionId: string, items: OperacionItemInput[]) {
    for (const item of items) {
      await client.query(
        `INSERT INTO public.operacion_detalle
           (operacion_id, producto_sucursal_id, cantidad, alicuota_iva, iva_ars, iva_usd, precio_unit_ars, precio_unit_usd, costo_unit_ars, costo_unit_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          operacionId,
          item.producto_sucursal_id,
          item.cantidad,
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

  private async insertCuentas(client: PoolClient, operacionId: string, cuentas: CuentaRepartoResuelta[]) {
    for (const cuenta of cuentas) {
      await client.query(
        `INSERT INTO public.operacion_cuenta
           (operacion_id, cuenta_financiera_id, porcentaje_venta, porcentaje_extra, monto_ars, monto_usd)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          operacionId, cuenta.cuenta_financiera_id, cuenta.porcentaje_venta,
          cuenta.porcentaje_extra, cuenta.monto_ars, cuenta.monto_usd ?? null,
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
      if (rows[0].cantidad_disponible < item.cantidad) {
        const { rows: prodRows } = await client.query(
          'SELECT nombre FROM public.producto WHERE id = $1',
          [rows[0].producto_id]
        );
        const nombre = prodRows[0]?.nombre ?? item.producto_sucursal_id;
        throw new BusinessError(`Stock insuficiente para ${nombre}`);
      }
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
        throw new BusinessError(`Stock insuficiente para trasladar el producto ${rows[0].producto_id}`);
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

  private async ajustarSaldos(client: PoolClient, cuentas: CuentaRepartoResuelta[], direccion: 'debito' | 'credito') {
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
