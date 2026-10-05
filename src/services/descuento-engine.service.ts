import { pool } from '../config/db';
import {
  calcularCascada,
  calcularPrecioMinimo,
  resolverDescuentoProducto,
  ResultadoCascada,
  AlertaMargen,
} from '../utils/cascada-descuentos';
import { resolverDescuento } from './descuento-categoria.service';
import { BusinessError } from '../utils/errors';
import { CatalogoError } from '../utils/errors';
import { ContextoMonetario, resolverPrecio } from '../utils/moneda';

export interface EvaluarItemInput {
  productoSucursalId?: string;
  productoId?: string;
  precioManual?: number | null;
  cantidad?: number;
}

export interface EvaluacionItemResultado {
  productoSucursalId?: string;
  productoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioBase: number;
  precioSugerido: number;
  precioFinal: number;
  subtotal: number;
  descuentoEfectivo: number;
  resultadoCascada: ResultadoCascada;
  analisisMargen: ResultadoCascada['analisisMargen'];
  alertas: AlertaMargen[];
}

export interface ResumenEvaluacionOperacion {
  subtotalBase: number;
  totalFinal: number;
  descuentoTotalPesos: number;
  descuentoEfectivoTotal: number;
  gananciaTotalEstimada: number | null;
  margenEfectivoPromedio: number | null;
  hayAlertas: boolean;
  hayTopeAplicado: boolean;
  hayMargenPerforado: boolean;
  hayVentaEnPerdida: boolean;
  alertasGlobales: AlertaMargen[];
}

export interface EvaluacionOperacionResultado {
  contexto_monetario?: ContextoMonetario;
  sucursal: {
    id: string;
    nombre: string;
    descuento: number;
  };
  cliente: {
    id: string;
    nombre: string;
    descuentoHabitual: number | null;
    regionNombre: string | null;
    regionDescuento: number | null;
  } | null;
  items: EvaluacionItemResultado[];
  resumen: ResumenEvaluacionOperacion;
}

export class DescuentoEngineService {
  /**
   * Evalúa la cascada de descuentos completa y analiza el margen de ganancias
   * para una lista de productos en el contexto de una sucursal y un cliente.
   */
  async evaluarOperacion(
    tenantId: string,
    sucursalId: string,
    clienteId: string | null | undefined,
    items: EvaluarItemInput[],
    cotizacionVersion?: string
  ): Promise<EvaluacionOperacionResultado> {
    if (!sucursalId) {
      throw new BusinessError('La sucursal es obligatoria.');
    }

    // 1. Obtener datos de la sucursal
    const { rows: sucursalRows } = await pool.query(
      `SELECT s.id, s.nombre, s.descuento,
        jsonb_build_object('cotizacion_usd_ars', t.cotizacion_usd_ars::text,
          'cotizacion_version', t.cotizacion_version::text,
          'actualizada_at', t.cotizacion_actualizada_at) AS contexto_monetario
        FROM public.sucursal s JOIN public.tenant t ON t.id = s.tenant_id
        WHERE s.id = $1 AND s.tenant_id = $2`,
      [sucursalId, tenantId]
    );
    const sucursalData = sucursalRows[0];
    if (!sucursalData) {
      throw new BusinessError('La sucursal indicada no existe.');
    }
    const descuentoSucursal = sucursalData.descuento != null ? Number(sucursalData.descuento) : 0;
    const contexto: ContextoMonetario = sucursalData.contexto_monetario ?? { cotizacion_usd_ars: null, cotizacion_version: '0', actualizada_at: null };
    if (cotizacionVersion !== undefined && cotizacionVersion !== contexto.cotizacion_version) {
      throw new CatalogoError('Cambió el valor del dólar. Actualizá la evaluación de precios.', 'COTIZACION_CAMBIO', 409);
    }

    // 2. Obtener datos del cliente si corresponde
    let clienteData: {
      id: string;
      nombre: string;
      descuentoHabitual: number | null;
      regionNombre: string | null;
      regionDescuento: number | null;
    } | null = null;

    let descuentoClienteHabitual: number | null = null;
    let descuentoRegionCliente: number | null = null;
    let categoriasClienteMap: Map<string, number> = new Map(); // tipo_id -> %
    let subtiposClienteMap: Map<string, number> = new Map(); // subtipo_id -> %
    let productosClienteMap: Map<string, number> = new Map(); // producto_id -> %

    if (clienteId) {
      const { rows: cliRows } = await pool.query(
        'SELECT id, nombre, descuento_porcentaje FROM public.cliente WHERE id = $1 AND tenant_id = $2',
        [clienteId, tenantId]
      );
      if (cliRows[0]) {
        const c = cliRows[0];
        descuentoClienteHabitual = c.descuento_porcentaje != null ? Number(c.descuento_porcentaje) : null;

        // Región del cliente para esta sucursal
        const { rows: regRows } = await pool.query(
          `SELECT r.id, r.nombre, r.descuento
           FROM public.cliente_region cr
           JOIN public.region r ON r.id = cr.region_id
           WHERE cr.cliente_id = $1 AND cr.sucursal_id = $2 AND r.activo = TRUE`,
          [clienteId, sucursalId]
        );
        let regionNombre: string | null = null;
        if (regRows[0]) {
          regionNombre = regRows[0].nombre;
          descuentoRegionCliente = Number(regRows[0].descuento);
        }

        clienteData = {
          id: c.id,
          nombre: c.nombre,
          descuentoHabitual: descuentoClienteHabitual,
          regionNombre,
          regionDescuento: descuentoRegionCliente,
        };

        // Categorías y subcategorías del cliente
        const { rows: cdcRows } = await pool.query(
          'SELECT tipo_id, subtipo_id, porcentaje FROM public.cliente_descuento_categoria WHERE cliente_id = $1',
          [clienteId]
        );
        for (const row of cdcRows) {
          if (row.tipo_id) categoriasClienteMap.set(row.tipo_id, Number(row.porcentaje));
          if (row.subtipo_id) subtiposClienteMap.set(row.subtipo_id, Number(row.porcentaje));
        }

        // Productos específicos del cliente
        const { rows: cdpRows } = await pool.query(
          'SELECT producto_id, porcentaje FROM public.cliente_descuento_producto WHERE cliente_id = $1',
          [clienteId]
        );
        for (const row of cdpRows) {
          productosClienteMap.set(row.producto_id, Number(row.porcentaje));
        }
      }
    }

    // 3. Procesar cada ítem
    const itemsEvaluados: EvaluacionItemResultado[] = [];

    for (const item of items) {
      const cantidad = item.cantidad && item.cantidad > 0 ? item.cantidad : 1;

      // Obtener datos del producto y sucursal
      let query = '';
      let params: unknown[] = [];

      if (item.productoSucursalId) {
        query = `
          SELECT
            ps.id AS producto_sucursal_id,
            p.id  AS producto_id,
            p.codigo,
            p.nombre,
            p.precio_base,
            p.precio_base_usd, p.moneda_precio_base,
            ps.costo_reposicion,
            ps.margen_minimo,
            ps.descuento AS descuento_producto_sucursal,
            p.descuento_base AS descuento_producto_base,
            p.tipo_id,
            p.subtipo_id,
            t.descuento_general AS tipo_descuento_general,
            st.descuento_general AS subtipo_descuento_general
          FROM public.producto_sucursal ps
          JOIN public.producto p ON p.id = ps.producto_id
          LEFT JOIN public.tipo t ON t.id = p.tipo_id
          LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
          WHERE ps.id = $1 AND ps.sucursal_id = $2 AND p.tenant_id = $3
        `;
        params = [item.productoSucursalId, sucursalId, tenantId];
      } else if (item.productoId) {
        query = `
          SELECT
            ps.id AS producto_sucursal_id,
            p.id  AS producto_id,
            p.codigo,
            p.nombre,
            p.precio_base,
            p.precio_base_usd, p.moneda_precio_base,
            ps.costo_reposicion,
            ps.margen_minimo,
            ps.descuento AS descuento_producto_sucursal,
            p.descuento_base AS descuento_producto_base,
            p.tipo_id,
            p.subtipo_id,
            t.descuento_general AS tipo_descuento_general,
            st.descuento_general AS subtipo_descuento_general
          FROM public.producto p
          LEFT JOIN public.producto_sucursal ps ON ps.producto_id = p.id AND ps.sucursal_id = $2
          LEFT JOIN public.tipo t ON t.id = p.tipo_id
          LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
          WHERE p.id = $1 AND p.tenant_id = $3
        `;
        params = [item.productoId, sucursalId, tenantId];
      } else {
        continue;
      }

      const { rows: prodRows } = await pool.query(query, params);
      const prod = prodRows[0];
      if (!prod) continue;

      const monedaBase = prod.moneda_precio_base === 'USD' ? 'USD' : 'ARS';
      const precioResuelto = resolverPrecio(monedaBase, monedaBase === 'USD' ? prod.precio_base_usd : prod.precio_base, contexto);
      if (monedaBase === 'USD' && !precioResuelto.ars) throw new CatalogoError('Configurá el dólar para evaluar este precio USD.', 'COTIZACION_REQUERIDA');
      const precioBase = precioResuelto.ars != null ? Number(precioResuelto.ars) : 0;
      const costoReposicion = prod.costo_reposicion != null ? Number(prod.costo_reposicion) : null;
      const margenMinimo = prod.margen_minimo != null ? Number(prod.margen_minimo) : null;

      // Nivel 2: Descuento de Categoría / Subcategoría general
      let descuentoCategoria: number | null = null;
      if (prod.tipo_id || prod.subtipo_id) {
        // Excepciones de sucursal
        const { rows: excRows } = await pool.query(
          `SELECT tipo_id, subtipo_id, porcentaje
           FROM public.descuento_categoria_sucursal
           WHERE sucursal_id = $1 AND (tipo_id = $2 OR subtipo_id = $3)`,
          [sucursalId, prod.tipo_id, prod.subtipo_id]
        );

        const excTipo = excRows.find((e) => e.tipo_id === prod.tipo_id);
        const excSubtipo = excRows.find((e) => e.subtipo_id === prod.subtipo_id);

        const catData = {
          descuentoGeneral: prod.tipo_descuento_general != null ? Number(prod.tipo_descuento_general) : null,
          excepciones: excTipo ? [{ sucursalId, porcentaje: Number(excTipo.porcentaje) }] : [],
        };
        const subData = prod.subtipo_id
          ? {
              descuentoGeneral: prod.subtipo_descuento_general != null ? Number(prod.subtipo_descuento_general) : null,
              excepciones: excSubtipo ? [{ sucursalId, porcentaje: Number(excSubtipo.porcentaje) }] : [],
            }
          : undefined;

        const resCat = resolverDescuento(sucursalId, catData, subData);
        descuentoCategoria = resCat.porcentaje;
      }

      // Nivel 3: Descuento de Producto general
      const resProd = resolverDescuentoProducto(
        prod.descuento_producto_sucursal,
        prod.descuento_producto_base
      );
      const descuentoProducto = resProd.porcentaje;

      // Nivel 4b: Descuento categoría / subcategoría del cliente
      let descuentoCategoriaCliente: number | null = null;
      if (prod.subtipo_id && subtiposClienteMap.has(prod.subtipo_id)) {
        descuentoCategoriaCliente = subtiposClienteMap.get(prod.subtipo_id)!;
      } else if (prod.tipo_id && categoriasClienteMap.has(prod.tipo_id)) {
        descuentoCategoriaCliente = categoriasClienteMap.get(prod.tipo_id)!;
      }

      // Nivel 4c: Descuento producto del cliente
      const descuentoProductoCliente = productosClienteMap.get(prod.producto_id) ?? null;

      // Calcular cascada completa
      const resultadoCascada = calcularCascada({
        precioBase,
        descuentoSucursal,
        descuentoCategoria,
        descuentoProducto,
        descuentoRegionCliente,
        descuentoCategoriaCliente,
        descuentoProductoCliente,
        descuentoCliente: descuentoClienteHabitual,
        precioManual: item.precioManual,
        costoReposicion,
        margenMinimo,
      });

      const precioFinal = resultadoCascada.precioFinal;
      const subtotalItem = Math.round(precioFinal * cantidad * 100) / 100;

      itemsEvaluados.push({
        productoSucursalId: prod.producto_sucursal_id ?? undefined,
        productoId: prod.producto_id,
        codigo: prod.codigo ?? '',
        nombre: prod.nombre,
        cantidad,
        precioBase,
        precioSugerido: resultadoCascada.precioSinTope,
        precioFinal,
        subtotal: subtotalItem,
        descuentoEfectivo: resultadoCascada.descuentoEfectivo,
        resultadoCascada,
        analisisMargen: resultadoCascada.analisisMargen,
        alertas: resultadoCascada.alertas,
      });
    }

    // 4. Resumen consolidado de la operación
    let subtotalBase = 0;
    let totalFinal = 0;
    let costoTotal = 0;
    let costoTotalCalculable = true;

    let hayTopeAplicado = false;
    let hayMargenPerforado = false;
    let hayVentaEnPerdida = false;
    const alertasGlobales: AlertaMargen[] = [];

    for (const item of itemsEvaluados) {
      subtotalBase += item.precioBase * item.cantidad;
      totalFinal += item.subtotal;

      const costo = item.analisisMargen.costoReposicion;
      if (costo != null && costo > 0) {
        costoTotal += costo * item.cantidad;
      } else {
        costoTotalCalculable = false;
      }

      if (item.analisisMargen.topeAplicado) hayTopeAplicado = true;
      if (item.analisisMargen.margenPerforado) hayMargenPerforado = true;
      if (item.analisisMargen.estado === 'en_perdida') hayVentaEnPerdida = true;

      // Consolidar alertas críticas o de advertencia
      for (const al of item.alertas) {
        if (al.severidad === 'critica' || al.severidad === 'advertencia') {
          alertasGlobales.push({
            ...al,
            mensaje: `[${item.codigo || item.nombre}]: ${al.mensaje}`,
          });
        }
      }
    }

    subtotalBase = Math.round(subtotalBase * 100) / 100;
    totalFinal = Math.round(totalFinal * 100) / 100;
    const descuentoTotalPesos = Math.max(0, Math.round((subtotalBase - totalFinal) * 100) / 100);
    const descuentoEfectivoTotal =
      subtotalBase > 0 ? Math.round((descuentoTotalPesos / subtotalBase) * 10000) / 100 : 0;

    let gananciaTotalEstimada: number | null = null;
    let margenEfectivoPromedio: number | null = null;

    if (costoTotalCalculable && costoTotal > 0) {
      gananciaTotalEstimada = Math.round((totalFinal - costoTotal) * 100) / 100;
      margenEfectivoPromedio = Math.round((gananciaTotalEstimada / costoTotal) * 10000) / 100;
    }

    const resumen: ResumenEvaluacionOperacion = {
      subtotalBase,
      totalFinal,
      descuentoTotalPesos,
      descuentoEfectivoTotal,
      gananciaTotalEstimada,
      margenEfectivoPromedio,
      hayAlertas: alertasGlobales.length > 0,
      hayTopeAplicado,
      hayMargenPerforado,
      hayVentaEnPerdida,
      alertasGlobales,
    };

    return {
      sucursal: {
        id: sucursalData.id,
        nombre: sucursalData.nombre,
        descuento: descuentoSucursal,
      },
      cliente: clienteData,
      items: itemsEvaluados,
      resumen,
      contexto_monetario: contexto,
    };
  }
}
