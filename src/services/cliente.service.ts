import { ClienteRepository, ClienteData, ClienteFiltros } from '../repositories/cliente.repository';
import { BusinessError } from '../utils/errors';
import { exigirSucursal, SucursalAlcance } from './sucursal-alcance.service';
import { normalizarProvincia, PROVINCIAS_ARGENTINAS } from '../utils/provincias-argentina';

export class ClienteService {
  private clienteRepository: ClienteRepository;

  constructor() {
    this.clienteRepository = new ClienteRepository();
  }

  async getAllClientes(tenantId: string, operativo = false, alcance?: SucursalAlcance) {
    return this.clienteRepository.findAll(tenantId, operativo, alcance?.sucursalIds);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string, alcance?: SucursalAlcance) {
    return this.clienteRepository.findPaginated(tenantId, limit, offset, search, alcance?.sucursalIds);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    filtros?: ClienteFiltros,
    sortBy?: string,
    sortDir?: string,
    alcance?: SucursalAlcance
  ) {
    return this.clienteRepository.findPaginatedWithTotal(tenantId, limit, offset, search, filtros, sortBy, sortDir, alcance?.sucursalIds);
  }

  async getValoresUnicos(tenantId: string, campo: string, alcance?: SucursalAlcance) {
    if (campo === 'provincia') return [...PROVINCIAS_ARGENTINAS];
    return this.clienteRepository.findValoresUnicos(tenantId, campo, alcance?.sucursalIds);
  }

  async getCliente(id: string, tenantId: string, alcance?: SucursalAlcance) {
    return this.clienteRepository.findById(id, tenantId, alcance?.sucursalIds);
  }

  async createCliente(data: Omit<ClienteData, 'tenant_id'>, tenantId: string, alcance?: SucursalAlcance) {
    data = this.normalizarProvinciaCliente(data);
    if (data.sucursal_ids !== undefined && !Array.isArray(data.sucursal_ids)) {
      throw new BusinessError('La lista de puntos de venta no es válida.');
    }
    if (data.sucursal_ids?.some((sucursalId) => typeof sucursalId !== 'string')) {
      throw new BusinessError('La lista de puntos de venta no es válida.');
    }
    // En el alta la sucursal es obligatoria: un cliente sin sucursal no lo atiende nadie.
    const sucursales = data.sucursal_ids ?? [];
    if (alcance) {
      for (const sucursalId of sucursales) exigirSucursal(alcance, sucursalId, true);
    }
    this.validar(data);
    if (sucursales.length === 0) {
      throw new BusinessError('El cliente debe estar asociado al menos a una sucursal.');
    }
    await this.validarSucursales(sucursales, tenantId);
    return this.clienteRepository.create(
      { ...data, tenant_id: tenantId },
      alcance?.sucursalIds,
      alcance?.sucursalesActivasIds
    );
  }

  async updateCliente(id: string, data: Partial<ClienteData>, tenantId: string, alcance?: SucursalAlcance) {
    const cliente = await this.clienteRepository.findById(id, tenantId, alcance?.sucursalIds);
    if (!cliente) return null;
    data = this.normalizarProvinciaCliente(data, cliente.provincia);
    if (alcance) {
      if (data.sucursal_ids !== undefined && (!Array.isArray(data.sucursal_ids) || data.sucursal_ids.some((sucursalId) => typeof sucursalId !== 'string'))) {
        throw new BusinessError('La lista de puntos de venta no es válida.');
      }
      for (const sucursalId of data.sucursal_ids ?? []) exigirSucursal(alcance, sucursalId);
      this.validar(data);
      return this.clienteRepository.updateEnAlcance(
        id, data, tenantId, alcance.sucursalIds, alcance.sucursalesActivasIds, alcance.authId
      );
    }
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

  async desactivarCliente(id: string, tenantId: string, alcance?: SucursalAlcance) {
    return this.clienteRepository.desactivar(id, tenantId, alcance?.sucursalIds);
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

  private normalizarProvinciaCliente<T extends Partial<ClienteData>>(data: T, provinciaAnterior?: string | null): T {
    if (!('provincia' in data)) return data;
    const provincia = normalizarProvincia(data.provincia);
    if (provincia !== undefined) return { ...data, provincia };
    // Un valor anterior desconocido puede conservarse al editar otros datos.
    if (data.provincia === provinciaAnterior) {
      const resto = { ...data };
      delete resto.provincia;
      return resto;
    }
    throw new BusinessError('Seleccioná una provincia argentina válida o dejá el campo sin especificar.');
  }
}
