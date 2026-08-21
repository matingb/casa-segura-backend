import { TipoOperacionRepository } from '../repositories/tipo-operacion.repository';

export class TipoOperacionService {
  private repo = new TipoOperacionRepository();

  async getAll() {
    return this.repo.findAll();
  }
}
