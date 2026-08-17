import { OperacionRepository } from '../repositories/operacion.repository';

export class OperacionService {
  private repo = new OperacionRepository();

  async getAll(tenantId: string, sucursalId?: string, tipoId?: string) {
    return this.repo.findAll(tenantId, sucursalId, tipoId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string, tipoId?: string) {
    return this.repo.findPaginated(tenantId, limit, offset, sucursalId, tipoId);
  }

  async getById(tenantId: string, id: string) {
    return this.repo.findById(tenantId, id);
  }
}

