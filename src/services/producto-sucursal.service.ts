import { ProductoSucursalRepository, ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';
import { BusinessError } from '../utils/errors';
import { columnasMonto, escribirConMontos, MontosResueltos, validarContratoPrecio } from './precio-catalogo.service';
import { Dinero } from '../utils/moneda';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { exigirSucursal, SucursalAlcance } from './sucursal-alcance.service';

const CAMPOS_PRECIO = ['precio_venta_ars', 'precio_venta_usd', 'moneda_precio_venta', 'precio_referencia_confirmada'];
const CAMPOS_COSTO = ['costo_reposicion_usd', 'moneda_costo_reposicion'];

/**
 * Compara costo y precio en ARS con la cotización vigente. Si ambos tienen
 * referencia USD, la comparación se hace en USD para no depender del redondeo
 * de los equivalentes.
 */
export function validarMargenMinimoConfiguracion(
  data: Pick<ProductoSucursalData, 'costo_reposicion' | 'precio_venta_ars' | 'margen_minimo'> & {
    costo_usd?: string | null; precio_venta_usd_principal?: string | null;
  }
) {
  if (data.costo_usd != null && data.precio_venta_usd_principal != null && data.margen_minimo != null) {
    const costoUsd = new Dinero(data.costo_usd);
    if (costoUsd.isZero()) return;
    const minimoUsd = costoUsd.mul(new Dinero(String(data.margen_minimo)).div(100).plus(1));
    if (new Dinero(data.precio_venta_usd_principal).lt(minimoUsd)) {
      throw new BusinessError(
        `El precio de venta debe respetar el margen minimo de ${data.margen_minimo}%. El precio minimo permitido es US$${minimoUsd.toDecimalPlaces(4, Dinero.ROUND_CEIL).toFixed(4)}.`
      );
    }
    return;
  }

  const convertirNumero = (valor: unknown, campo: string): number | null => {
    if (valor === null || valor === undefined) return null;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) {
      throw new BusinessError(`El campo "${campo}" debe ser un numero valido mayor o igual a cero.`);
    }
    return numero;
  };

  const costo = convertirNumero(data.costo_reposicion, 'costo_reposicion');
  const precioVenta = convertirNumero(data.precio_venta_ars, 'precio_venta_ars');
  const margenMinimo = convertirNumero(data.margen_minimo, 'margen_minimo');

  if (costo === null || costo === undefined || precioVenta === null || precioVenta === undefined || margenMinimo === null || margenMinimo === undefined) {
    return;
  }

  if (costo === 0) {
    return;
  }

  const precioMinimo = new Dinero(String(data.costo_reposicion)).mul(new Dinero(String(data.margen_minimo)).div(100).plus(1));
  if (new Dinero(String(data.precio_venta_ars)).lt(precioMinimo)) {
    throw new BusinessError(
      `El precio de venta ARS debe respetar el margen minimo de ${margenMinimo}%. El precio minimo permitido es $${precioMinimo.toFixed(2)}.`
    );
  }
}

/**
 * El descuento del producto es el nivel 3 de la cascada de listas de precios.
 * Acá solo se valida el rango: el tope real por margen mínimo depende de los
 * descuentos que se apliquen antes, y se resuelve al calcular la lista.
 */
export function validarDescuentoProducto(descuento: unknown) {
  if (descuento === null || descuento === undefined) return;
  const valor = Number(descuento);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
  }
}

/**
 * Las cantidades se cargan a mano (al crear o editar el stock): tienen que ser
 * enteros no negativos. Si no vienen, no se tocan.
 */
export function validarCantidades(data: Partial<Pick<ProductoSucursalData, 'cantidad_disponible' | 'cantidad_reservada'>>) {
  const campos = [
    ['cantidad_disponible', 'La cantidad disponible'],
    ['cantidad_reservada', 'La cantidad reservada'],
  ] as const;
  for (const [campo, etiqueta] of campos) {
    if (!(campo in data)) continue;
    const valor = data[campo] as unknown;
    if (valor === null || valor === undefined || !Number.isInteger(Number(valor)) || Number(valor) < 0 || (typeof valor === 'string' && valor.trim() === '')) {
      throw new BusinessError(`${etiqueta} debe ser un número entero mayor o igual a 0.`);
    }
  }
}

type Monto = { ars: unknown; usd: unknown; moneda: unknown };

function margenEntre(costo: Monto, precio: Monto, margen: unknown) {
  const ambosUsd = costo.moneda === 'USD' && precio.moneda === 'USD' && costo.usd != null && precio.usd != null;
  validarMargenMinimoConfiguracion({
    costo_reposicion: costo.ars as number | null,
    precio_venta_ars: precio.ars as number | null,
    margen_minimo: margen as number | null,
    ...(ambosUsd ? { costo_usd: String(costo.usd), precio_venta_usd_principal: String(precio.usd) } : {}),
  });
}

/** Columnas de producto_sucursal que surgen del precio y del costo resueltos. */
function columnasMontos({ precio, costo }: MontosResueltos): Partial<ProductoSucursalData> {
  const p = precio && columnasMonto(precio);
  const c = costo && columnasMonto(costo);
  return {
    ...(p ? { precio_venta_ars: p.ars, precio_venta_usd: p.usd, moneda_precio_venta: p.moneda, precio_referencia_confirmada: true } : {}),
    ...(c ? { costo_reposicion: c.ars, costo_reposicion_usd: c.usd, moneda_costo_reposicion: c.moneda } : {}),
  };
}

/** Un `costo_reposicion` numérico sin `costo` es un principal ARS (contrato anterior). */
function normalizarMontos<T extends Partial<ProductoSucursalData>>(data: T): T {
  validarContratoPrecio(data, CAMPOS_PRECIO);
  validarContratoPrecio(data, CAMPOS_COSTO, 'Cargá el costo de reposición con su moneda de referencia.');
  if ('costo' in data) {
    const resto = { ...data };
    delete resto.costo_reposicion;
    return resto;
  }
  if ('costo_reposicion' in data) return { ...data, moneda_costo_reposicion: 'ARS', costo_reposicion_usd: null };
  return data;
}

const tieneMontos = (data: Partial<ProductoSucursalData>) => 'precio' in data || 'costo' in data;
const montosDe = (data: Partial<ProductoSucursalData>) => ({
  ...('precio' in data ? { precio: data.precio ?? null } : {}),
  ...('costo' in data ? { costo: data.costo ?? null } : {}),
});

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string, operativo = false, alcance?: SucursalAlcance, sucursalId?: string) {
    return this.repo.findAll(tenantId, operativo, alcance?.sucursalIds, sucursalId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalId?: string, operativo = false, alcance?: SucursalAlcance) {
    return this.repo.findPaginated(tenantId, limit, offset, search, sucursalId, operativo, alcance?.sucursalIds);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    sucursalId?: string,
    filtros?: ProductoSucursalFiltros,
    sortBy?: string,
    sortDir?: string,
    operativo = false,
    alcance?: SucursalAlcance
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, search, sucursalId, filtros, sortBy, sortDir, operativo, alcance?.sucursalIds);
  }

  async getValoresUnicos(tenantId: string, campo: string, alcance?: SucursalAlcance) {
    return this.repo.findValoresUnicos(tenantId, campo, alcance?.sucursalIds);
  }

  async getById(id: string, tenantId: string, alcance?: SucursalAlcance) {
    return this.repo.findById(id, tenantId, undefined, alcance?.sucursalIds);
  }

  async create(tenantId: string, data: ProductoSucursalData, alcance?: SucursalAlcance) {
    if (alcance) exigirSucursal(alcance, data.sucursal_id, true);
    validarDescuentoProducto(data.descuento);
    validarCantidades(data);
    data = normalizarMontos(data);
    if (tieneMontos(data)) {
      const item = await escribirConMontos(tenantId, montosDe(data), async (client, resueltos) => {
        const preparado = { ...data, ...columnasMontos(resueltos) };
        margenEntre(
          { ars: preparado.costo_reposicion, usd: preparado.costo_reposicion_usd, moneda: preparado.moneda_costo_reposicion },
          { ars: preparado.precio_venta_ars, usd: preparado.precio_venta_usd, moneda: preparado.moneda_precio_venta },
          preparado.margen_minimo);
        return this.repo.create(preparado, tenantId, client, alcance?.sucursalesActivasIds);
      }, data.sucursal_id);
      if (!item) throw new BusinessError('El producto o la sucursal no pertenecen al tenant actual.');
      return this.repo.findById(item.id, tenantId, undefined, alcance?.sucursalIds);
    }
    validarMargenMinimoConfiguracion(data);
    const item = await this.repo.create(data, tenantId, undefined, alcance?.sucursalesActivasIds);
    if (!item) {
      throw new BusinessError('El producto o la sucursal no pertenecen al tenant actual.');
    }
    return this.repo.findById(item.id, tenantId, undefined, alcance?.sucursalIds);
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string, alcance?: SucursalAlcance) {
    if (alcance && data.sucursal_id) exigirSucursal(alcance, data.sucursal_id);
    const actual = await this.repo.findById(id, tenantId, undefined, alcance?.sucursalIds);
    if (!actual) return null;
    if (data.sucursal_id !== undefined && data.sucursal_id !== actual.sucursal_id) {
      throw new BusinessError('No se puede cambiar el punto de venta del stock existente.');
    }
    // Acepta que el cliente reenvíe el PDV actual, pero no lo incluye en el UPDATE.
    delete data.sucursal_id;
    if (Object.keys(data).length === 0) return actual;
    if ('descuento' in data) {
      validarDescuentoProducto(data.descuento);
    }
    validarCantidades(data);
    data = normalizarMontos(data);
    if (tieneMontos(data)) {
      await escribirConMontos(tenantId, montosDe(data), async (client, resueltos) => {
        const actualTransaccional = await this.repo.findById(id, tenantId, client, alcance?.sucursalIds);
        if (!actualTransaccional) return null;
        const costoActual: Monto = { ars: actualTransaccional.costo_reposicion_ars_resuelto ?? actualTransaccional.costo_reposicion, usd: actualTransaccional.costo_reposicion_usd, moneda: actualTransaccional.moneda_costo_reposicion };
        // Precio efectivo: el propio o, si no tiene, el base del producto.
        const precioActual: Monto = { ars: actualTransaccional.precio_venta_ars_resuelto, usd: actualTransaccional.precio_efectivo_usd, moneda: actualTransaccional.moneda_precio_efectiva };
        const costoLegado: Monto | null = 'costo_reposicion' in data ? { ars: data.costo_reposicion, usd: null, moneda: 'ARS' } : null;
        const margen = 'margen_minimo' in data ? data.margen_minimo : actualTransaccional.margen_minimo;
        const columnas = columnasMontos(resueltos);
        margenEntre(
          resueltos.costo ? { ars: columnas.costo_reposicion, usd: columnas.costo_reposicion_usd, moneda: columnas.moneda_costo_reposicion } : costoLegado ?? costoActual,
          resueltos.precio ? { ars: columnas.precio_venta_ars, usd: columnas.precio_venta_usd, moneda: columnas.moneda_precio_venta } : precioActual,
          margen);
        return this.repo.update(id, { ...data, ...columnas }, tenantId, client, alcance?.sucursalIds);
      }, actual.sucursal_id);
      return this.repo.findById(id, tenantId, undefined, alcance?.sucursalIds);
    }
    return withTransaction(async (client) => {
      // La vista resuelve importes con la tasa protegida hasta guardar el cambio.
      await new CotizacionRepository().obtenerPorSucursal(tenantId, actual.sucursal_id, client);
      const actualTransaccional = await this.repo.findById(id, tenantId, client, alcance?.sucursalIds);
      if (!actualTransaccional) return null;
      const costoActual: Monto = { ars: actualTransaccional.costo_reposicion_ars_resuelto ?? actualTransaccional.costo_reposicion, usd: actualTransaccional.costo_reposicion_usd, moneda: actualTransaccional.moneda_costo_reposicion };
      const precioActual: Monto = { ars: actualTransaccional.precio_venta_ars_resuelto, usd: actualTransaccional.precio_efectivo_usd, moneda: actualTransaccional.moneda_precio_efectiva };
      const costoLegado: Monto | null = 'costo_reposicion' in data ? { ars: data.costo_reposicion, usd: null, moneda: 'ARS' } : null;
      const margen = 'margen_minimo' in data ? data.margen_minimo : actualTransaccional.margen_minimo;
      margenEntre(costoLegado ?? costoActual, precioActual, margen);
      const guardado = await this.repo.update(id, data, tenantId, client, alcance?.sucursalIds);
      return guardado ? this.repo.findById(id, tenantId, client, alcance?.sucursalIds) : null;
    });
  }

  async eliminar(id: string, tenantId: string, alcance?: SucursalAlcance) {
    return this.repo.softDelete(id, tenantId, alcance?.sucursalIds);
  }
}
