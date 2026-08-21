import { PedidoReposicionRepository, PedidoReposicionCrearData, PedidoReposicionFiltros } from '../repositories/pedido-reposicion.repository';

export class PedidoReposicionService {
  private repo = new PedidoReposicionRepository();

  async getAll(tenantId: string, sucursalId?: string) {
    return this.repo.findAll(tenantId, sucursalId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string) {
    return this.repo.findPaginated(tenantId, limit, offset, sucursalId);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    sucursalId?: string,
    filtros?: PedidoReposicionFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, sucursalId, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.repo.findValoresUnicos(tenantId, campo);
  }

  async crear(tenantId: string, usuarioId: string, data: PedidoReposicionCrearData) {
    return this.repo.insert(tenantId, usuarioId, data);
  }
}
