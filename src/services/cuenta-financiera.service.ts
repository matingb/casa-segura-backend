import { CuentaFinancieraRepository } from '../repositories/cuenta-financiera.repository';

export class CuentaFinancieraService {
  private repo = new CuentaFinancieraRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
