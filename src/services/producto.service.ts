import { ProductoRepository, ProductoData, ProductoFiltros } from '../repositories/producto.repository';
import { uploadProductImage, getPublicUrl } from './storage.service';

export class ProductoService {
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoRepository = new ProductoRepository();
  }

  async getAllProductos(tenantId: string) {
    return this.productoRepository.findAll(tenantId);
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

  async createProducto(data: Omit<ProductoData, 'tenant_id'>, tenantId: string) {
    return this.productoRepository.create({ ...data, tenant_id: tenantId });
  }

  async updateProducto(id: string, data: Partial<ProductoData>, tenantId: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;
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
}

