import { ProductoSucursalRepository, ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';
import { BusinessError } from '../utils/errors';

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

  const precioMinimo = costo * (1 + margenMinimo / 100);
  if (precioVenta < precioMinimo) {
    throw new BusinessError(
      `El precio de venta ARS debe respetar el margen minimo de ${margenMinimo}%. El precio minimo permitido es $${precioMinimo.toFixed(2)}.`
    );
  }
}

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalId?: string) {
    return this.repo.findPaginated(tenantId, limit, offset, search, sucursalId);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    sucursalId?: string,
    filtros?: ProductoSucursalFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, search, sucursalId, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.repo.findValoresUnicos(tenantId, campo);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(tenantId: string, data: ProductoSucursalData) {
    validarMargenMinimoConfiguracion(data);
    const item = await this.repo.create(data, tenantId);
    if (!item) {
      throw new BusinessError('El producto o la sucursal no pertenecen al tenant actual.');
    }
    return item;
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string) {
    const actual = await this.repo.findById(id, tenantId);
    if (!actual) return null;
    validarMargenMinimoConfiguracion({
      costo_reposicion: 'costo_reposicion' in data ? data.costo_reposicion : actual.costo_reposicion,
      precio_venta_ars: 'precio_venta_ars' in data ? data.precio_venta_ars : actual.precio_venta_ars,
      margen_minimo: 'margen_minimo' in data ? data.margen_minimo : actual.margen_minimo,
    });
    return this.repo.update(id, data, tenantId);
  }
}
