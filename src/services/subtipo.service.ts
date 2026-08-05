import { SubtipoRepository } from '../repositories/subtipo.repository';

export class SubtipoService {
  private repo = new SubtipoRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
