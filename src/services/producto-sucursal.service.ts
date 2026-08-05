import { ProductoSucursalRepository } from '../repositories/producto-sucursal.repository';

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
