import { RegionRepository, RegionData } from '../repositories/region.repository';
import { BusinessError, CatalogoError } from '../utils/errors';
import { exigirSucursal, recursoNoDisponible, SucursalAlcance } from './sucursal-alcance.service';

type RegionInput = Partial<Pick<RegionData, 'nombre' | 'descuento' | 'activo'>> & { sucursal_ids?: unknown };

export class RegionService {
  private repo = new RegionRepository();

  async getRegiones(tenantId: string, soloActivas = false, alcance?: SucursalAlcance) {
    return this.repo.findAll(tenantId, soloActivas, alcance?.sucursalIds);
  }

  async getRegionesPorSucursal(sucursalId: string, tenantId: string, soloActivas = false, alcance?: SucursalAlcance) {
    if (alcance) exigirSucursal(alcance, sucursalId, true);
    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }
    return this.repo.findBySucursal(sucursalId, tenantId, soloActivas, alcance?.sucursalIds);
  }

  async getRegion(id: string, tenantId: string, alcance?: SucursalAlcance) {
    const region = await this.repo.findById(id, tenantId, alcance?.sucursalIds);
    if (!region) {
      throw recursoNoDisponible();
    }
    return region;
  }

  async crearRegion(tenantId: string, data: RegionInput, alcance?: SucursalAlcance) {
    const sucursalIds = await this.validarSucursales(data.sucursal_ids, tenantId, alcance, true);
    const nombre = this.validarNombre(data.nombre);
    await this.verificarNombreLibre(tenantId, nombre);
    this.validarPorcentaje(data.descuento);

    return this.repo.create(tenantId, {
      nombre,
      descuento: data.descuento !== undefined && data.descuento !== null ? Number(data.descuento) : 0,
      activo: data.activo ?? true,
      sucursal_ids: sucursalIds,
    }, alcance?.sucursalIds);
  }

  async actualizarRegion(id: string, tenantId: string, data: RegionInput, alcance?: SucursalAlcance) {
    if (alcance) await this.exigirRegionEditable(id, tenantId, alcance);
    const actual = await this.repo.findById(id, tenantId, alcance?.sucursalIds);
    if (!actual) {
      throw recursoNoDisponible();
    }

    const cambios: Partial<RegionData> = {};
    if (data.sucursal_ids !== undefined) {
      cambios.sucursal_ids = await this.validarSucursales(
        data.sucursal_ids, tenantId, alcance, true, actual.sucursales.map((sucursal) => sucursal.id)
      );
      // Un punto de venta que algún cliente usa con esta región no se puede quitar.
      const quitadas = actual.sucursales.map((s) => s.id).filter((s) => !cambios.sucursal_ids!.includes(s));
      if (quitadas.length > 0) {
        const enUso = await this.repo.contarClientesPorSucursal(id, quitadas);
        if (enUso.length > 0) {
          const detalle = enUso.map((u) => `${u.sucursal_nombre} (${u.clientes} cliente${u.clientes === 1 ? '' : 's'})`).join(', ');
          throw new BusinessError(
            `No se puede quitar de la región: ${detalle}. Esos clientes tienen asignada esta región en ese punto de venta; cambiales la región primero.`
          );
        }
      }
    }
    if (data.nombre !== undefined) {
      cambios.nombre = this.validarNombre(data.nombre);
      await this.verificarNombreLibre(tenantId, cambios.nombre, id);
    }
    if (data.descuento !== undefined) {
      this.validarPorcentaje(data.descuento);
      cambios.descuento = Number(data.descuento);
    }
    if (data.activo !== undefined) {
      cambios.activo = data.activo;
    }

    return this.repo.update(id, tenantId, cambios, alcance?.sucursalIds);
  }

  async desactivarRegion(id: string, tenantId: string, alcance?: SucursalAlcance) {
    if (alcance) await this.exigirRegionEditable(id, tenantId, alcance);
    const actual = await this.repo.findById(id, tenantId, alcance?.sucursalIds);
    if (!actual) {
      throw recursoNoDisponible();
    }
    return this.repo.desactivar(id, tenantId, alcance?.sucursalIds);
  }

  async eliminarRegion(id: string, tenantId: string, alcance?: SucursalAlcance) {
    if (alcance) await this.exigirRegionEditable(id, tenantId, alcance);
    const actual = await this.repo.findById(id, tenantId, alcance?.sucursalIds);
    if (!actual) {
      throw recursoNoDisponible();
    }
    const clientesAsignados = await this.repo.contarClientesEnRegion(id);
    if (clientesAsignados > 0) {
      // Si tiene clientes asociados, desactivarla en lugar de error duro para no romper datos
      return this.repo.desactivar(id, tenantId, alcance?.sucursalIds);
    }
    const eliminada = await this.repo.delete(id, tenantId, alcance?.sucursalIds);
    return eliminada ? actual : null;
  }

  // --- Asignación a clientes ---

  async getRegionesPorCliente(clienteId: string, tenantId: string, alcance?: SucursalAlcance) {
    return this.repo.findRegionesPorCliente(clienteId, tenantId, alcance?.sucursalIds);
  }

  async asignarRegionCliente(clienteId: string, sucursalId: string, regionId: string, tenantId: string) {
    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }
    const region = await this.repo.findById(regionId, tenantId);
    if (!region || !region.sucursales.some((s) => s.id === sucursalId)) {
      throw new BusinessError('La región seleccionada no incluye el punto de venta indicado.');
    }
    return this.repo.asignarRegionCliente(clienteId, sucursalId, regionId, tenantId);
  }

  async quitarRegionCliente(clienteId: string, sucursalId: string, tenantId: string) {
    return this.repo.quitarRegionCliente(clienteId, sucursalId, tenantId);
  }

  private validarNombre(valor: unknown): string {
    const nombre = typeof valor === 'string' ? valor.trim() : '';
    if (!nombre) {
      throw new BusinessError('El nombre de la región es obligatorio.');
    }
    if (nombre.length > 100) {
      throw new BusinessError('El nombre de la región no puede superar los 100 caracteres.');
    }
    return nombre;
  }

  /** El nombre es único por empresa (sin distinguir mayúsculas). */
  private async verificarNombreLibre(tenantId: string, nombre: string, excluirId?: string) {
    const existentes = await this.repo.findAll(tenantId);
    if (existentes.some((r) => r.id !== excluirId && r.nombre.toLowerCase() === nombre.toLowerCase())) {
      throw new BusinessError('Ya existe una región con ese nombre.');
    }
  }

  /** Al menos un punto de venta, sin repetir, todos de la empresa. */
  private async validarSucursales(
    valor: unknown,
    tenantId: string,
    alcance?: SucursalAlcance,
    soloActivas = false,
    preservables: string[] = []
  ): Promise<string[]> {
    if (!Array.isArray(valor) || valor.length === 0 || !valor.every((v) => typeof v === 'string' && v)) {
      throw new BusinessError('Elegí al menos un punto de venta para la región.');
    }
    const ids = [...new Set(valor as string[])];
    if (alcance) {
      for (const id of ids) exigirSucursal(alcance, id, soloActivas && !preservables.includes(id));
    }
    if ((await this.repo.sucursalesDelTenant(ids, tenantId)) !== ids.length) {
      if (alcance) {
        throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
      }
      throw new BusinessError('Alguno de los puntos de venta elegidos no existe.');
    }
    const nuevas = ids.filter((id) => !preservables.includes(id));
    if (soloActivas && (await this.repo.sucursalesDelTenant(nuevas, tenantId, true)) !== nuevas.length) {
      throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
    }
    return ids;
  }

  private async exigirRegionEditable(id: string, tenantId: string, alcance: SucursalAlcance): Promise<string[]> {
    const sucursales = await this.repo.findSucursalIds(id, tenantId);
    if (!sucursales || !sucursales.some((sucursalId) => alcance.sucursalIds.includes(sucursalId))) {
      throw recursoNoDisponible();
    }
    if (sucursales.some((sucursalId) => !alcance.sucursalIds.includes(sucursalId))) {
      throw new CatalogoError(
        'La región incluye puntos de venta fuera de tu alcance.',
        'REGION_COMPARTIDA_FUERA_DE_ALCANCE',
        403
      );
    }
    return sucursales;
  }

  private validarPorcentaje(valor?: number | null) {
    if (valor === undefined || valor === null) return;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }
}
