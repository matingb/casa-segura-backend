import { SucursalRepository } from '../repositories/sucursal.repository';

export class SucursalService {
  private repo = new SucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
