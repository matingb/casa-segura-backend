import { SubtipoRepository } from '../repositories/subtipo.repository';

export class SubtipoService {
  private repo = new SubtipoRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async create(tenantId: string, tipoId: string, nombre: string) {
    return this.repo.create(tenantId, tipoId, nombre);
  }

  async rename(tenantId: string, id: string, nombre: string) {
    return this.repo.rename(tenantId, id, nombre);
  }

  async delete(tenantId: string, id: string) {
    return this.repo.delete(tenantId, id);
  }
}
