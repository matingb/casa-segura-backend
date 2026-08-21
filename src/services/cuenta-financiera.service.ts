import { CuentaFinancieraRepository, CuentaFinancieraFiltros } from '../repositories/cuenta-financiera.repository';

const repo = new CuentaFinancieraRepository();

export class CuentaFinancieraService {
  async getAll(tenantId: string) {
    return repo.findAll(tenantId);
  }

  async getAllFiltradas(tenantId: string, filtros?: CuentaFinancieraFiltros, sortBy?: string, sortDir?: string) {
    return repo.findAllFiltradas(tenantId, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return repo.findValoresUnicos(tenantId, campo);
  }

  async getById(tenantId: string, id: string) {
    return repo.findById(tenantId, id);
  }

  async create(tenantId: string, data: {
    nombre: string;
    saldo_inicial: number;
    porcentaje_extra: number;
  }) {
    return repo.insert(tenantId, data);
  }

  async update(tenantId: string, id: string, data: {
    nombre?: string;
    saldo_inicial?: number;
    porcentaje_extra?: number;
  }) {
    return repo.update(tenantId, id, data);
  }

  async getMovimientos(tenantId: string, id: string) {
    return repo.findMovimientos(tenantId, id);
  }
}

