import { OperacionRepository } from '../repositories/operacion.repository';

export class OperacionService {
  private repo = new OperacionRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number) {
    return this.repo.findPaginated(tenantId, limit, offset);
  }
}
