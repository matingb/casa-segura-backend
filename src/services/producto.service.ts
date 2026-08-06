import { ProductoRepository, ProductoData } from '../repositories/producto.repository';

export class ProductoService {
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoRepository = new ProductoRepository();
  }

  async getAllProductos(tenantId: string) {
    return this.productoRepository.findAll(tenantId);
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
}

