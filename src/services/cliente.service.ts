import { ClienteRepository, ClienteData, ClienteFiltros } from '../repositories/cliente.repository';
import { BusinessError } from '../utils/errors';

export class ClienteService {
  private clienteRepository: ClienteRepository;

  constructor() {
    this.clienteRepository = new ClienteRepository();
  }

  async getAllClientes(tenantId: string, operativo = false) {
    return this.clienteRepository.findAll(tenantId, operativo);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string) {
    return this.clienteRepository.findPaginated(tenantId, limit, offset, search);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    filtros?: ClienteFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.clienteRepository.findPaginatedWithTotal(tenantId, limit, offset, search, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.clienteRepository.findValoresUnicos(tenantId, campo);
  }

  async getCliente(id: string, tenantId: string) {
    return this.clienteRepository.findById(id, tenantId);
  }

  async createCliente(data: Omit<ClienteData, 'tenant_id'>, tenantId: string) {
    this.validar(data);
    // En el alta la sucursal es obligatoria: un cliente sin sucursal no lo atiende nadie.
    const sucursales = data.sucursal_ids ?? [];
    if (sucursales.length === 0) {
      throw new BusinessError('El cliente debe estar asociado al menos a una sucursal.');
    }
    await this.validarSucursales(sucursales, tenantId);
    return this.clienteRepository.create({ ...data, tenant_id: tenantId });
  }

  async updateCliente(id: string, data: Partial<ClienteData>, tenantId: string) {
    const cliente = await this.clienteRepository.findById(id, tenantId);
    if (!cliente) return null;
    this.validar(data);
    // En una edición parcial, `sucursal_ids` puede no venir: solo se valida si
    // el cliente efectivamente intenta cambiarlas, y nunca puede dejarlas vacías.
    if (data.sucursal_ids !== undefined) {
      if (data.sucursal_ids.length === 0) {
        throw new BusinessError('El cliente debe estar asociado al menos a una sucursal.');
      }
      await this.validarSucursales(data.sucursal_ids, tenantId);
    }
    return this.clienteRepository.update(id, data, tenantId);
  }

  async desactivarCliente(id: string, tenantId: string) {
    return this.clienteRepository.desactivar(id, tenantId);
  }

  /**
   * El único campo obligatorio es el nombre, para poder dar de alta rápido a un
   * cliente ocasional del que solo se conoce ese dato. El resto se valida solo
   * cuando viene con valor.
   */
  private validar(data: Partial<ClienteData>) {
    if ('nombre' in data) {
      const nombre = typeof data.nombre === 'string' ? data.nombre.trim() : '';
      if (!nombre) {
        throw new BusinessError('El nombre del cliente es obligatorio.');
      }
    }

    if (data.tipo_cliente != null && !['persona', 'empresa'].includes(data.tipo_cliente)) {
      throw new BusinessError('El tipo de cliente debe ser "persona" o "empresa".');
    }

    if (data.descuento_porcentaje != null) {
      const descuento = Number(data.descuento_porcentaje);
      if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
        throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
      }
    }
  }

  private async validarSucursales(sucursalIds: string[], tenantId: string) {
    const invalidas = await this.clienteRepository.sucursalesInvalidas(sucursalIds, tenantId);
    if (invalidas.length > 0) {
      throw new BusinessError('Alguna de las sucursales seleccionadas no existe.');
    }
  }
}
