import { RolRepository } from '../repositories/rol.repository';

export class RolService {
  private repo = new RolRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
