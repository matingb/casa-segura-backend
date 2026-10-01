import { RegionRepository, RegionData } from '../repositories/region.repository';
import { BusinessError } from '../utils/errors';

export class RegionService {
  private repo = new RegionRepository();

  async getRegionesPorSucursal(sucursalId: string, tenantId: string, soloActivas = false) {
    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }
    return this.repo.findBySucursal(sucursalId, tenantId, soloActivas);
  }

  async getRegion(id: string, tenantId: string) {
    const region = await this.repo.findById(id, tenantId);
    if (!region) {
      throw new BusinessError('La región no existe.');
    }
    return region;
  }

  async crearRegion(tenantId: string, data: RegionData) {
    const nombre = (data.nombre ?? '').trim();
    if (!nombre) {
      throw new BusinessError('El nombre de la región es obligatorio.');
    }
    if (nombre.length > 100) {
      throw new BusinessError('El nombre de la región no puede superar los 100 caracteres.');
    }

    if (!data.sucursal_id) {
      throw new BusinessError('La sucursal es obligatoria.');
    }

    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(data.sucursal_id, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }

    this.validarPorcentaje(data.descuento);

    // Verificar si ya existe una región con ese nombre en la misma sucursal
    const existentes = await this.repo.findBySucursal(data.sucursal_id, tenantId);
    if (existentes.some((r) => r.nombre.toLowerCase() === nombre.toLowerCase())) {
      throw new BusinessError('Ya existe una región con ese nombre en esta sucursal.');
    }

    return this.repo.create(tenantId, {
      sucursal_id: data.sucursal_id,
      nombre,
      descuento: data.descuento !== undefined && data.descuento !== null ? Number(data.descuento) : 0,
      activo: data.activo ?? true,
    });
  }

  async actualizarRegion(
    id: string,
    tenantId: string,
    data: Partial<Pick<RegionData, 'nombre' | 'descuento' | 'activo'>>
  ) {
    const actual = await this.repo.findById(id, tenantId);
    if (!actual) {
      throw new BusinessError('La región no existe.');
    }

    if (data.nombre !== undefined) {
      const nombre = data.nombre.trim();
      if (!nombre) {
        throw new BusinessError('El nombre de la región no puede quedar vacío.');
      }
      if (nombre.length > 100) {
        throw new BusinessError('El nombre de la región no puede superar los 100 caracteres.');
      }
      const existentes = await this.repo.findBySucursal(actual.sucursal_id, tenantId);
      if (existentes.some((r) => r.id !== id && r.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new BusinessError('Ya existe otra región con ese nombre en esta sucursal.');
      }
      data.nombre = nombre;
    }

    if (data.descuento !== undefined) {
      this.validarPorcentaje(data.descuento);
      data.descuento = Number(data.descuento);
    }

    return this.repo.update(id, tenantId, data);
  }

  async desactivarRegion(id: string, tenantId: string) {
    const actual = await this.repo.findById(id, tenantId);
    if (!actual) {
      throw new BusinessError('La región no existe.');
    }
    return this.repo.desactivar(id, tenantId);
  }

  async eliminarRegion(id: string, tenantId: string) {
    const actual = await this.repo.findById(id, tenantId);
    if (!actual) {
      throw new BusinessError('La región no existe.');
    }
    const clientesAsignados = await this.repo.contarClientesEnRegion(id);
    if (clientesAsignados > 0) {
      // Si tiene clientes asociados, desactivarla en lugar de error duro para no romper datos
      return this.repo.desactivar(id, tenantId);
    }
    const eliminada = await this.repo.delete(id, tenantId);
    return eliminada ? actual : null;
  }

  // --- Asignación a clientes ---

  async getRegionesPorCliente(clienteId: string, tenantId: string) {
    return this.repo.findRegionesPorCliente(clienteId, tenantId);
  }

  async asignarRegionCliente(clienteId: string, sucursalId: string, regionId: string, tenantId: string) {
    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }
    const region = await this.repo.findById(regionId, tenantId);
    if (!region || region.sucursal_id !== sucursalId) {
      throw new BusinessError('La región seleccionada no pertenece a la sucursal indicada.');
    }
    return this.repo.asignarRegionCliente(clienteId, sucursalId, regionId, tenantId);
  }

  async quitarRegionCliente(clienteId: string, sucursalId: string, tenantId: string) {
    return this.repo.quitarRegionCliente(clienteId, sucursalId, tenantId);
  }

  private validarPorcentaje(valor?: number | null) {
    if (valor === undefined || valor === null) return;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }
}
