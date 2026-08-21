import { OperacionRepository, OperacionCrearData, OperacionFiltros } from '../repositories/operacion.repository';

const TIPO_NOMBRE: Record<string, OperacionCrearData['tipo']> = {
  compra: 'Compra',
  venta: 'Venta',
  traslado: 'Traslado',
  movimiento: 'Movimiento',
};

export class OperacionService {
  private repo = new OperacionRepository();

  async getAll(tenantId: string, sucursalId?: string, tipoId?: string) {
    return this.repo.findAll(tenantId, sucursalId, tipoId);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, sucursalId?: string, tipoId?: string) {
    return this.repo.findPaginated(tenantId, limit, offset, sucursalId, tipoId);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    sucursalId?: string,
    tipoId?: string,
    filtros?: OperacionFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.repo.findPaginatedWithTotal(tenantId, limit, offset, sucursalId, tipoId, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.repo.findValoresUnicos(tenantId, campo);
  }

  async getById(tenantId: string, id: string) {
    return this.repo.findById(tenantId, id);
  }

  async crear(tenantId: string, authId: string, body: Omit<OperacionCrearData, 'tipo'> & { tipo: string }) {
    const tipo = TIPO_NOMBRE[body.tipo];
    return this.repo.crear(tenantId, authId, { ...body, tipo });
  }
}

