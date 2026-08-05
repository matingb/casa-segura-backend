import { PedidoReposicionRepository } from '../repositories/pedido-reposicion.repository';

export class PedidoReposicionService {
  private repo = new PedidoReposicionRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
