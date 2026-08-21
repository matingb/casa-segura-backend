import { ProductoSucursalRepository, ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';

export class ProductoSucursalService {
  private repo = new ProductoSucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalId?: string) {
    return this.repo.findPaginated(tenantId, limit, offset, search, sucursalId);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    sucursalId?: string,
    filtros?: ProductoSucursalFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, search, sucursalId, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.repo.findValoresUnicos(tenantId, campo);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(data: ProductoSucursalData) {
    return this.repo.create(data);
  }

  async update(id: string, data: Partial<ProductoSucursalData>, tenantId: string) {
    return this.repo.update(id, data, tenantId);
  }
}
