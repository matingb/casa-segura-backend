import { pool } from '../config/db';
import Decimal from 'decimal.js';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { CatalogoError } from '../utils/errors';
import { calcularCascada, EntradaCascada, resolverDescuentoProducto } from '../utils/cascada-descuentos';
import { resolverDescuento } from './descuento-categoria.service';
import { costoArsVigente, Dinero, resolverPrecio } from '../utils/moneda';

type NivelesCliente = Pick<EntradaCascada, 'descuentoRegionCliente' | 'descuentoCategoriaCliente' | 'descuentoProductoCliente' | 'descuentoCliente'>;
interface FilaProducto { producto_id: string; tipo_id: string | null; subtipo_id: string | null }

const numero = (valor: unknown) => (valor == null ? null : Number(valor));

export class ListaPreciosService {
  /** Lista de un cliente: los niveles generales más los propios del cliente. */
  async obtener(tenantId: string, sucursalId: string, clienteId: string) {
    const { rows: clientes } = await pool.query('SELECT id, nombre, descuento_porcentaje FROM public.cliente WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [clienteId, tenantId]);
    if (!clientes[0]) throw new CatalogoError('Cliente o sucursal no disponible para esta empresa.', 'CONTEXTO_INVALIDO', 404);
    const [categorias, descuentos, regiones] = await Promise.all([
      pool.query('SELECT tipo_id, subtipo_id, porcentaje FROM public.cliente_descuento_categoria WHERE cliente_id = $1', [clienteId]),
      pool.query('SELECT producto_id, porcentaje FROM public.cliente_descuento_producto WHERE cliente_id = $1', [clienteId]),
      pool.query(`SELECT r.nombre, r.descuento FROM public.cliente_region cr
        JOIN public.region r ON r.id = cr.region_id AND r.tenant_id = $3 AND r.activo = TRUE
        WHERE cr.cliente_id = $1 AND cr.sucursal_id = $2`, [clienteId, sucursalId, tenantId]),
    ]);
    const tipos = new Map<string, string>();
    const subtipos = new Map<string, string>();
    for (const row of categorias.rows) {
      if (row.subtipo_id) subtipos.set(row.subtipo_id, row.porcentaje);
      else if (row.tipo_id) tipos.set(row.tipo_id, row.porcentaje);
    }
    const especiales = new Map(descuentos.rows.map((row) => [row.producto_id, row.porcentaje]));
    const region = regiones.rows[0];
    const lista = await this.calcular(tenantId, sucursalId, (row) => ({
      descuentoRegionCliente: numero(region?.descuento),
      descuentoCategoriaCliente: numero((row.subtipo_id ? subtipos.get(row.subtipo_id) : undefined) ?? (row.tipo_id ? tipos.get(row.tipo_id) : undefined)),
      descuentoProductoCliente: numero(especiales.get(row.producto_id)),
      descuentoCliente: numero(clientes[0].descuento_porcentaje),
    }));
    return { ...lista, cliente: { ...clientes[0], regionNombre: region?.nombre ?? null, regionDescuento: region?.descuento ?? null } };
  }

  /** Lista general de una sucursal: solo los niveles que valen para todos los clientes. */
  async obtenerGeneral(tenantId: string, sucursalId: string) {
    return this.calcular(tenantId, sucursalId, () => ({}));
  }

  private async calcular(tenantId: string, sucursalId: string, nivelesCliente: (row: FilaProducto) => NivelesCliente) {
    const { rows: sucursales } = await pool.query('SELECT id, nombre, descuento FROM public.sucursal WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [sucursalId, tenantId]);
    if (!sucursales[0]) throw new CatalogoError('Cliente o sucursal no disponible para esta empresa.', 'CONTEXTO_INVALIDO', 404);
    const [contexto, productos, excepciones] = await Promise.all([
      new CotizacionRepository().obtener(tenantId),
      pool.query(`SELECT ps.*, p.codigo, p.nombre, p.marca, p.modelo, p.subtipo_id, p.descuento_base,
        st.tipo_id, st.nombre AS subtipo_nombre,
        st.descuento_general AS subtipo_descuento_general, t.descuento_general AS tipo_descuento_general
        FROM public.producto_sucursal ps JOIN public.producto p ON p.id = ps.producto_id
        LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
        LEFT JOIN public.tipo t ON t.id = st.tipo_id
        WHERE ps.sucursal_id = $1 AND p.tenant_id = $2 AND p.activo = TRUE
          AND ps.habilitado = TRUE AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
        ORDER BY p.nombre, ps.id`, [sucursalId, tenantId]),
      pool.query('SELECT tipo_id, subtipo_id, porcentaje FROM public.descuento_categoria_sucursal WHERE sucursal_id = $1', [sucursalId]),
    ]);
    const excepcionesSucursal = (campo: 'tipo_id' | 'subtipo_id', id: string | null) =>
      excepciones.rows.filter((e) => id && e[campo] === id).map((e) => ({ sucursalId, porcentaje: Number(e.porcentaje) }));
    const items = productos.rows.map((row) => {
      const moneda = row.moneda_precio_venta === 'USD' ? 'USD' : 'ARS';
      const principal = moneda === 'USD' ? row.precio_venta_usd : row.precio_venta_ars;
      const precio = resolverPrecio(moneda, principal, contexto);
      if (!row.precio_referencia_confirmada && row.precio_venta_usd != null) precio.estado = 'LEGADO_PENDIENTE_REVISION';
      if (moneda === 'USD' && !contexto.cotizacion_usd_ars) throw new CatalogoError('Configurá el valor del dólar para evaluar precios USD.', 'COTIZACION_REQUERIDA');
      // Costo en la moneda del precio: mismo principal si coinciden, si no se
      // convierte con la cotización vigente.
      const monedaCosto = row.moneda_costo_reposicion === 'USD' ? 'USD' : 'ARS';
      const costoArs = costoArsVigente(monedaCosto, row.costo_reposicion, row.costo_reposicion_usd, contexto);
      const costoNativo = moneda === 'USD'
        ? monedaCosto === 'USD' ? (row.costo_reposicion_usd == null ? null : new Dinero(row.costo_reposicion_usd))
          : costoArs == null ? null : new Dinero(costoArs).div(contexto.cotizacion_usd_ars!)
        : costoArs == null ? null : new Dinero(costoArs);
      // Niveles generales (todos los clientes), con la misma resolución que ventas:
      // categoría = excepción/general de subcategoría, si no de categoría;
      // producto = descuento de la sucursal, si no el general del producto.
      const categoriaGeneral = row.tipo_id || row.subtipo_id
        ? resolverDescuento(
            sucursalId,
            { descuentoGeneral: numero(row.tipo_descuento_general), excepciones: excepcionesSucursal('tipo_id', row.tipo_id) },
            row.subtipo_id
              ? { descuentoGeneral: numero(row.subtipo_descuento_general), excepciones: excepcionesSucursal('subtipo_id', row.subtipo_id) }
              : undefined
          ).porcentaje
        : null;
      const productoGeneral = resolverDescuentoProducto(row.descuento, row.descuento_base).porcentaje;
      const cascada = calcularCascada({ precioBase: principal ?? '0', decimalesMonetarios: moneda === 'USD' ? 4 : 2,
        descuentoSucursal: numero(sucursales[0].descuento),
        descuentoCategoria: categoriaGeneral,
        descuentoProducto: productoGeneral,
        ...nivelesCliente(row),
        costoReposicion: costoNativo?.toString() ?? null, margenMinimo: row.margen_minimo == null ? null : Number(row.margen_minimo) });
      const final = resolverPrecio(moneda, principal == null ? null : cascada.precioFinalDecimal!, contexto);
      const sinTope = new Dinero(cascada.precioSinTopeDecimal!);
      const minimo = cascada.precioMinimoDecimal != null ? new Dinero(cascada.precioMinimoDecimal)
        : costoNativo?.gt(0) && row.margen_minimo != null
          ? costoNativo.mul(new Dinero(row.margen_minimo).div(100).plus(1)).toDecimalPlaces(moneda === 'USD' ? 4 : 2, moneda === 'USD' ? Dinero.ROUND_CEIL : Dinero.ROUND_HALF_UP)
          : null;
      const tolerancia = moneda === 'USD' ? new Dinero('0.01').div(contexto.cotizacion_usd_ars!) : new Dinero('0.01');
      const noAlcanza = principal != null && costoNativo != null && costoNativo.gt(0) && row.margen_minimo != null && minimo != null && sinTope.lt(minimo.minus(tolerancia));
      const aArs = (valor: Decimal) => moneda === 'USD' ? valor.mul(contexto.cotizacion_usd_ars!).toFixed(2) : valor.toFixed(2);
      return {
        id: row.id, productoId: row.producto_id, codigo: row.codigo, nombre: row.nombre,
        marca: row.marca, modelo: row.modelo, subtipoNombre: row.subtipo_nombre ?? '', subtipoId: row.subtipo_id ?? null, tipoId: row.tipo_id ?? null,
        monedaReferencia: moneda, importeReferencia: precio.importe_referencia, importeFinalReferencia: final.importe_referencia, estadoPrecio: precio.estado,
        precioListaArs: precio.ars, precioFinalArs: final.ars, precioFinalUsd: final.usd,
        descuentoTotalPorcentaje: cascada.descuentoEfectivo, iva: row.iva,
        // Aunque un descuento del cliente los reemplace, se informan para simular sin él.
        descuentoCategoriaGeneral: categoriaGeneral,
        descuentoProductoGeneral: productoGeneral,
        descuentosDetalle: cascada.aportes.map((aporte) => `${aporte.nivel}: -${aporte.porcentaje}%`),
        descuentosAportes: cascada.aportes.map((aporte) => ({ nivel: aporte.nivel, porcentaje: aporte.porcentaje })),
        precioSinTope: principal == null ? null : aArs(sinTope),
        precioMinimo: minimo == null ? null : aArs(minimo),
        costoReposicion: costoArs, margenMinimo: row.margen_minimo,
        noAlcanzaMargen: noAlcanza,
        motivoMargen: noAlcanza ? 'Los descuentos configurados no alcanzan el margen mínimo de la sucursal.' : undefined,
      };
    });
    return { items, contexto_monetario: contexto, sucursal: { id: sucursales[0].id, nombre: sucursales[0].nombre } };
  }
}
