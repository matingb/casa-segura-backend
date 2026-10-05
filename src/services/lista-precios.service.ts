import { pool } from '../config/db';
import Decimal from 'decimal.js';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { CatalogoError } from '../utils/errors';
import { calcularCascada } from '../utils/cascada-descuentos';
import { Dinero, resolverPrecio } from '../utils/moneda';

export class ListaPreciosService {
  async obtener(tenantId: string, sucursalId: string, clienteId: string) {
    const { rows: sucursales } = await pool.query('SELECT id, nombre FROM public.sucursal WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [sucursalId, tenantId]);
    const { rows: clientes } = await pool.query('SELECT id, nombre, descuento_porcentaje FROM public.cliente WHERE id = $1 AND tenant_id = $2 AND activo = TRUE', [clienteId, tenantId]);
    if (!sucursales[0] || !clientes[0]) throw new CatalogoError('Cliente o sucursal no disponible para esta empresa.', 'CONTEXTO_INVALIDO', 404);
    const [contexto, productos, categorias, descuentos, regiones] = await Promise.all([
      new CotizacionRepository().obtener(tenantId),
      pool.query(`SELECT ps.*, p.codigo, p.nombre, p.marca, p.modelo, p.subtipo_id,
        st.tipo_id, st.nombre AS subtipo_nombre
        FROM public.producto_sucursal ps JOIN public.producto p ON p.id = ps.producto_id
        LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
        WHERE ps.sucursal_id = $1 AND p.tenant_id = $2 AND p.activo = TRUE
          AND ps.habilitado = TRUE AND p.deleted_at IS NULL AND ps.deleted_at IS NULL
        ORDER BY p.nombre, ps.id`, [sucursalId, tenantId]),
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
    const items = productos.rows.map((row) => {
      const moneda = row.moneda_precio_venta === 'USD' ? 'USD' : 'ARS';
      const principal = moneda === 'USD' ? row.precio_venta_usd : row.precio_venta_ars;
      const precio = resolverPrecio(moneda, principal, contexto);
      if (!row.precio_referencia_confirmada && row.precio_venta_usd != null) precio.estado = 'LEGADO_PENDIENTE_REVISION';
      if (moneda === 'USD' && !contexto.cotizacion_usd_ars) throw new CatalogoError('Configurá el valor del dólar para evaluar precios USD.', 'COTIZACION_REQUERIDA');
      const costo = row.costo_reposicion == null ? null : new Dinero(row.costo_reposicion);
      const costoNativo = moneda === 'USD' && costo ? costo.div(contexto.cotizacion_usd_ars!) : costo;
      const categoria = subtipos.get(row.subtipo_id) ?? tipos.get(row.tipo_id);
      const especial = especiales.get(row.producto_id);
      // Perfil LISTA_CLIENTE: conserva niveles y origen de la lista anterior.
      // No incorpora descuentos generales de sucursal/categoría ni herencia nueva.
      const cascada = calcularCascada({ precioBase: principal ?? '0', decimalesMonetarios: moneda === 'USD' ? 4 : 2,
        descuentoProducto: row.descuento == null ? null : Number(row.descuento),
        descuentoRegionCliente: region?.descuento == null ? null : Number(region.descuento),
        descuentoCategoriaCliente: categoria == null ? null : Number(categoria),
        descuentoProductoCliente: especial == null ? null : Number(especial),
        descuentoCliente: clientes[0].descuento_porcentaje == null ? null : Number(clientes[0].descuento_porcentaje),
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
        marca: row.marca, modelo: row.modelo, subtipoNombre: row.subtipo_nombre ?? '',
        monedaReferencia: moneda, importeReferencia: precio.importe_referencia, importeFinalReferencia: final.importe_referencia, estadoPrecio: precio.estado,
        precioListaArs: precio.ars, precioFinalArs: final.ars, precioFinalUsd: final.usd,
        descuentoTotalPorcentaje: cascada.descuentoEfectivo, iva: row.iva,
        descuentosDetalle: cascada.aportes.map((aporte) => `${aporte.nivel}: -${aporte.porcentaje}%`),
        precioSinTope: principal == null ? null : aArs(sinTope),
        precioMinimo: minimo == null ? null : aArs(minimo),
        costoReposicion: row.costo_reposicion, margenMinimo: row.margen_minimo,
        noAlcanzaMargen: noAlcanza,
        motivoMargen: noAlcanza ? 'Los descuentos configurados no alcanzan el margen mínimo de la sucursal.' : undefined,
      };
    });
    return { items, contexto_monetario: contexto, sucursal: sucursales[0],
      cliente: { ...clientes[0], regionNombre: region?.nombre ?? null, regionDescuento: region?.descuento ?? null } };
  }
}
