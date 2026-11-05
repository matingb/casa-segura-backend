import {
  ClienteDescuentoRepository,
  DestinoClienteDescuento,
} from '../repositories/cliente-descuento.repository';
import { RegionRepository } from '../repositories/region.repository';
import { ClienteRepository } from '../repositories/cliente.repository';
import { TipoRepository } from '../repositories/tipo.repository';
import { SubtipoRepository } from '../repositories/subtipo.repository';
import { BusinessError, CatalogoError } from '../utils/errors';
import { exigirSucursal, recursoNoDisponible, SucursalAlcance } from './sucursal-alcance.service';

export class ClienteDescuentoService {
  private repo = new ClienteDescuentoRepository();
  private regionRepo = new RegionRepository();
  private clienteRepo = new ClienteRepository();
  private tipoRepo = new TipoRepository();
  private subtipoRepo = new SubtipoRepository();

  async getDescuentosCliente(clienteId: string, tenantId: string, alcance?: SucursalAlcance) {
    const cliente = await this.clienteRepo.findById(clienteId, tenantId, alcance?.sucursalIds);
    if (!cliente) {
      throw recursoNoDisponible();
    }

    const [regiones, categorias, productos] = await Promise.all([
      this.regionRepo.findRegionesPorCliente(clienteId, tenantId, alcance?.sucursalIds),
      this.repo.findCategoriasByCliente(clienteId, tenantId),
      this.repo.findProductosByCliente(clienteId, tenantId),
    ]);

    return {
      clienteId,
      descuentoGeneral: cliente.descuento_porcentaje != null ? Number(cliente.descuento_porcentaje) : null,
      regiones,
      categorias,
      productos,
    };
  }

  async asignarDescuentoCategoria(
    clienteId: string,
    tenantId: string,
    destino: DestinoClienteDescuento,
    porcentaje: number,
    nota?: string | null,
    alcance?: SucursalAlcance
  ) {
    await this.exigirClienteAccesible(clienteId, tenantId, alcance);

    this.validarPorcentaje(porcentaje);

    const existeDestino = 'tipoId' in destino
      ? await this.tipoRepo.existeEnTenant(tenantId, destino.tipoId)
      : await this.subtipoRepo.existeEnTenant(tenantId, destino.subtipoId);

    if (!existeDestino) {
      throw new BusinessError('La categoría o subcategoría seleccionada no existe.');
    }

    return this.repo.upsertCategoria(clienteId, destino, Number(porcentaje), nota);
  }

  async quitarDescuentoCategoria(clienteId: string, id: string, tenantId: string, alcance?: SucursalAlcance) {
    await this.exigirClienteAccesible(clienteId, tenantId, alcance);
    const eliminado = await this.repo.deleteCategoria(clienteId, id, tenantId);
    if (!eliminado) {
      throw new BusinessError('Descuento de categoría no encontrado.');
    }
    return { id, clienteId };
  }

  async asignarDescuentoProducto(
    clienteId: string,
    tenantId: string,
    productoId: string,
    porcentaje: number,
    nota?: string | null,
    alcance?: SucursalAlcance
  ) {
    await this.exigirClienteAccesible(clienteId, tenantId, alcance);

    this.validarPorcentaje(porcentaje);

    const productoExiste = await this.repo.existeProducto(productoId, tenantId);
    if (!productoExiste) {
      throw new BusinessError('El producto seleccionado no existe.');
    }

    return this.repo.upsertProducto(clienteId, productoId, Number(porcentaje), nota);
  }

  async quitarDescuentoProducto(clienteId: string, id: string, tenantId: string, alcance?: SucursalAlcance) {
    await this.exigirClienteAccesible(clienteId, tenantId, alcance);
    const eliminado = await this.repo.deleteProducto(clienteId, id, tenantId);
    if (!eliminado) {
      throw new BusinessError('Descuento de producto no encontrado.');
    }
    return { id, clienteId };
  }

  async asignarRegion(clienteId: string, tenantId: string, sucursalId: string, regionId: string, alcance?: SucursalAlcance) {
    const cliente = await this.exigirClienteAccesible(clienteId, tenantId, alcance);
    if (alcance) exigirSucursal(alcance, sucursalId, true);
    if (alcance && !cliente.sucursales.some((sucursal: { id: string }) => sucursal.id === sucursalId)) {
      throw recursoNoDisponible();
    }

    const sucursalValida = await this.regionRepo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }

    const region = await this.regionRepo.findById(regionId, tenantId, alcance?.sucursalIds);
    if (!region) throw recursoNoDisponible();
    if (!region.sucursales.some((s) => s.id === sucursalId)) {
      throw new BusinessError('La región no pertenece a la sucursal seleccionada.');
    }

    const asignacion = await this.regionRepo.asignarRegionCliente(clienteId, sucursalId, regionId, tenantId, alcance?.sucursalIds);
    if (!asignacion) {
      throw new BusinessError('No se pudo asignar la región al cliente.');
    }
    return asignacion;
  }

  async quitarRegion(clienteId: string, tenantId: string, sucursalId: string, alcance?: SucursalAlcance) {
    const cliente = await this.exigirClienteAccesible(clienteId, tenantId, alcance);
    if (alcance) exigirSucursal(alcance, sucursalId);
    if (alcance && !cliente.sucursales.some((sucursal: { id: string }) => sucursal.id === sucursalId)) {
      throw recursoNoDisponible();
    }
    const removido = await this.regionRepo.quitarRegionCliente(clienteId, sucursalId, tenantId);
    if (!removido) {
      throw new BusinessError('Asignación de región no encontrada.');
    }
    return { clienteId, sucursalId };
  }

  private async exigirClienteAccesible(clienteId: string, tenantId: string, alcance?: SucursalAlcance) {
    const cliente = await this.clienteRepo.findById(clienteId, tenantId, alcance?.sucursalIds);
    if (!cliente) throw recursoNoDisponible();
    return cliente;
  }

  private validarPorcentaje(valor: number) {
    if (valor === undefined || valor === null) {
      throw new BusinessError('El porcentaje de descuento es obligatorio.');
    }
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }
}
