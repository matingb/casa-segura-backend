import { UsuarioSucursalRepository } from '../repositories/usuario-sucursal.repository';

export class UsuarioSucursalService {
  private repo = new UsuarioSucursalRepository();

  async getAll(tenantId: string) {
    return this.repo.findAll(tenantId);
  }
}
