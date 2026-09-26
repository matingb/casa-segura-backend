import { ProductoRepository, ProductoData, ProductoFiltros } from '../repositories/producto.repository';
import { uploadProductImage, getPublicUrl } from './storage.service';
import { BusinessError } from '../utils/errors';

export class ProductoService {
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoRepository = new ProductoRepository();
  }

  async getAllProductos(tenantId: string, operativo = false) {
    return this.productoRepository.findAll(tenantId, operativo);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string) {
    return this.productoRepository.findPaginated(tenantId, limit, offset, search);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    filtros?: ProductoFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.productoRepository.findPaginatedWithTotal(tenantId, limit, offset, search, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.productoRepository.findValoresUnicos(tenantId, campo);
  }

  async getProducto(id: string, tenantId: string) {
    return this.productoRepository.findById(id, tenantId);
  }

  /**
   * Descuento general del producto (nivel 3 de la cascada). Solo se valida el
   * rango: el tope real por margen mínimo depende de la sucursal y se resuelve
   * al calcular la lista de precios.
   */
  private validarDescuentoBase(descuento: unknown) {
    if (descuento === null || descuento === undefined) return;
    const valor = Number(descuento);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }

  async createProducto(data: Omit<ProductoData, 'tenant_id'>, tenantId: string) {
    this.validarDescuentoBase(data.descuento_base);
    return this.productoRepository.create({ ...data, tenant_id: tenantId });
  }

  async updateProducto(id: string, data: Partial<ProductoData>, tenantId: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;
    if ('descuento_base' in data) {
      this.validarDescuentoBase(data.descuento_base);
    }
    return this.productoRepository.update(id, data, tenantId);
  }

  async uploadImage(id: string, tenantId: string, buffer: Buffer, mimetype: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;

    const storagePath = await uploadProductImage(tenantId, id, buffer, mimetype);
    const publicUrl = getPublicUrl(storagePath);
    await this.productoRepository.updateImagePath(id, publicUrl, tenantId);
    
    return publicUrl;
  }

  async eliminarProducto(id: string, tenantId: string) {
    return this.productoRepository.softDelete(id, tenantId);
  }
}

