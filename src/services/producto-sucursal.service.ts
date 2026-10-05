import { ProductoSucursalRepository, ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';
import { BusinessError } from '../utils/errors';
import { escribirConPrecio, validarContratoPrecio } from './precio-catalogo.service';
import { Dinero } from '../utils/moneda';

export function validarMargenMinimoConfiguracion(
  data: Pick<ProductoSucursalData, 'costo_reposicion' | 'precio_venta_ars' | 'margen_minimo'>
) {
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

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string, operativo = false) {
    return this.repo.findAll(tenantId, operativo);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalId?: string, operativo = false) {
    return this.repo.findPaginated(tenantId, limit, offset, search, sucursalId, operativo);
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
    operativo = false
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, search, sucursalId, filtros, sortBy, sortDir, operativo);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.repo.findValoresUnicos(tenantId, campo);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(tenantId: string, data: ProductoSucursalData) {
    validarMargenMinimoConfiguracion(data);
    validarDescuentoProducto(data.descuento);
    validarContratoPrecio(data, ['precio_venta_ars', 'precio_venta_usd', 'moneda_precio_venta', 'precio_referencia_confirmada']);
    if ('precio' in data) {
      const item = await escribirConPrecio(tenantId, data.precio ?? null, async (client, precio) => {
        const preparado = { ...data, precio_venta_ars: precio.ars, precio_venta_usd: precio.usd,
          moneda_precio_venta: precio.importe_referencia == null ? 'ARS' as const : precio.moneda_referencia,
          precio_referencia_confirmada: true };
        validarMargenMinimoConfiguracion(preparado);
        return this.repo.create(preparado, tenantId, client);
      });
      if (!item) throw new BusinessError('El producto o la sucursal no pertenecen al tenant actual.');
      return this.repo.findById(item.id, tenantId);
    }
    const item = await this.repo.create(data, tenantId);
    if (!item) {
      throw new BusinessError('El producto o la sucursal no pertenecen al tenant actual.');
    }
    return this.repo.findById(item.id, tenantId);
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string) {
    const actual = await this.repo.findById(id, tenantId);
    if (!actual) return null;
    if (!('precio' in data)) validarMargenMinimoConfiguracion({
      costo_reposicion: 'costo_reposicion' in data ? data.costo_reposicion : actual.costo_reposicion,
      precio_venta_ars: 'precio_venta_ars' in data ? data.precio_venta_ars : actual.precio_venta_ars_resuelto ?? actual.precio_venta_ars,
      margen_minimo: 'margen_minimo' in data ? data.margen_minimo : actual.margen_minimo,
    });
    if ('descuento' in data) {
      validarDescuentoProducto(data.descuento);
    }
    validarContratoPrecio(data, ['precio_venta_ars', 'precio_venta_usd', 'moneda_precio_venta', 'precio_referencia_confirmada']);
    if ('precio' in data) {
      await escribirConPrecio(tenantId, data.precio ?? null, async (client, precio) => {
        validarMargenMinimoConfiguracion({
          costo_reposicion: 'costo_reposicion' in data ? data.costo_reposicion : actual.costo_reposicion,
          precio_venta_ars: precio.ars,
          margen_minimo: 'margen_minimo' in data ? data.margen_minimo : actual.margen_minimo,
        });
        return this.repo.update(id, { ...data, precio_venta_ars: precio.ars, precio_venta_usd: precio.usd,
          moneda_precio_venta: precio.importe_referencia == null ? 'ARS' : precio.moneda_referencia,
          precio_referencia_confirmada: true }, tenantId, client);
      });
      return this.repo.findById(id, tenantId);
    }
    const guardado = await this.repo.update(id, data, tenantId);
    return guardado ? this.repo.findById(id, tenantId) : null;
  }

  async eliminar(id: string, tenantId: string) {
    return this.repo.softDelete(id, tenantId);
  }
}
