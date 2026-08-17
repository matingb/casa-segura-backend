import { PedidoReposicionRepository } from '../repositories/pedido-reposicion.repository';

export class PedidoReposicionService {
  private repo = new PedidoReposicionRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number) {
    return this.repo.findPaginated(tenantId, limit, offset);
  }
}
