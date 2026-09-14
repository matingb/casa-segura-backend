import { TipoRepository } from '../repositories/tipo.repository';

export class TipoService {
  private repo = new TipoRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async create(tenantId: string, nombre: string) {
    return this.repo.create(tenantId, nombre);
  }

  async delete(tenantId: string, id: string) {
    return this.repo.delete(tenantId, id);
  }
}
