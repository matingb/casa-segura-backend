import {
  ClienteDescuentoRepository,
  DestinoClienteDescuento,
} from '../repositories/cliente-descuento.repository';
import { RegionRepository } from '../repositories/region.repository';
import { ClienteRepository } from '../repositories/cliente.repository';
import { TipoRepository } from '../repositories/tipo.repository';
import { SubtipoRepository } from '../repositories/subtipo.repository';
import { BusinessError } from '../utils/errors';

export class ClienteDescuentoService {
  private repo = new ClienteDescuentoRepository();
  private regionRepo = new RegionRepository();
  private clienteRepo = new ClienteRepository();
  private tipoRepo = new TipoRepository();
  private subtipoRepo = new SubtipoRepository();

  async getDescuentosCliente(clienteId: string, tenantId: string) {
    const cliente = await this.clienteRepo.findById(clienteId, tenantId);
    if (!cliente) {
      throw new BusinessError('El cliente no existe.');
    }

    const [regiones, categorias, productos] = await Promise.all([
      this.regionRepo.findRegionesPorCliente(clienteId, tenantId),
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
    nota?: string | null
  ) {
    const clienteExiste = await this.repo.existeCliente(clienteId, tenantId);
    if (!clienteExiste) {
      throw new BusinessError('El cliente no existe.');
    }

    this.validarPorcentaje(porcentaje);

    const existeDestino = 'tipoId' in destino
      ? await this.tipoRepo.existeEnTenant(tenantId, destino.tipoId)
      : await this.subtipoRepo.existeEnTenant(tenantId, destino.subtipoId);

    if (!existeDestino) {
      throw new BusinessError('La categoría o subcategoría seleccionada no existe.');
    }

    return this.repo.upsertCategoria(clienteId, destino, Number(porcentaje), nota);
  }

  async quitarDescuentoCategoria(clienteId: string, id: string, tenantId: string) {
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
    nota?: string | null
  ) {
    const clienteExiste = await this.repo.existeCliente(clienteId, tenantId);
    if (!clienteExiste) {
      throw new BusinessError('El cliente no existe.');
    }

    this.validarPorcentaje(porcentaje);

    const productoExiste = await this.repo.existeProducto(productoId, tenantId);
    if (!productoExiste) {
      throw new BusinessError('El producto seleccionado no existe.');
    }

    return this.repo.upsertProducto(clienteId, productoId, Number(porcentaje), nota);
  }

  async quitarDescuentoProducto(clienteId: string, id: string, tenantId: string) {
    const eliminado = await this.repo.deleteProducto(clienteId, id, tenantId);
    if (!eliminado) {
      throw new BusinessError('Descuento de producto no encontrado.');
    }
    return { id, clienteId };
  }

  async asignarRegion(clienteId: string, tenantId: string, sucursalId: string, regionId: string) {
    const clienteExiste = await this.repo.existeCliente(clienteId, tenantId);
    if (!clienteExiste) {
      throw new BusinessError('El cliente no existe.');
    }

    const sucursalValida = await this.regionRepo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }

    const region = await this.regionRepo.findById(regionId, tenantId);
    if (!region || region.sucursal_id !== sucursalId) {
      throw new BusinessError('La región no pertenece a la sucursal seleccionada.');
    }

    const asignacion = await this.regionRepo.asignarRegionCliente(clienteId, sucursalId, regionId, tenantId);
    if (!asignacion) {
      throw new BusinessError('No se pudo asignar la región al cliente.');
    }
    return asignacion;
  }

  async quitarRegion(clienteId: string, tenantId: string, sucursalId: string) {
    const removido = await this.regionRepo.quitarRegionCliente(clienteId, sucursalId, tenantId);
    if (!removido) {
      throw new BusinessError('Asignación de región no encontrada.');
    }
    return { clienteId, sucursalId };
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
