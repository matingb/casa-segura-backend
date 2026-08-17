import { SucursalRepository } from '../repositories/sucursal.repository';

export class SucursalService {
  private repo = new SucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getByUser(authId: string, tenantId: string) {
    return this.repo.findByUsuario(authId, tenantId);
  }
}

