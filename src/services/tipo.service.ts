import { TipoRepository } from '../repositories/tipo.repository';

export class TipoService {
  private repo = new TipoRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
