import { ProveedorRepository } from '../repositories/proveedor.repository';

export class ProveedorService {
  private repo = new ProveedorRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
