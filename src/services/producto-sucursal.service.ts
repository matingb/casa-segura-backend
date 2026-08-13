import { ProductoSucursalRepository, ProductoSucursalData } from '../repositories/producto-sucursal.repository';

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(data: ProductoSucursalData) {
    return this.repo.create(data);
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string) {
    return this.repo.update(id, data, tenantId);
  }
}
