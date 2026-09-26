import { DescuentoCategoriaRepository, DestinoDescuento } from '../repositories/descuento-categoria.repository';
import { TipoRepository } from '../repositories/tipo.repository';
import { SubtipoRepository } from '../repositories/subtipo.repository';
import { BusinessError } from '../utils/errors';

export class DescuentoCategoriaService {
  private repo = new DescuentoCategoriaRepository();
  private tipoRepo = new TipoRepository();
  private subtipoRepo = new SubtipoRepository();

  async setDescuentoGeneralTipo(tenantId: string, tipoId: string, descuento: number | null) {
    this.validarPorcentaje(descuento);
    return this.tipoRepo.updateDescuentoGeneral(tenantId, tipoId, descuento);
  }

  async setDescuentoGeneralSubtipo(tenantId: string, subtipoId: string, descuento: number | null) {
    this.validarPorcentaje(descuento);
    return this.subtipoRepo.updateDescuentoGeneral(tenantId, subtipoId, descuento);
  }

  async setExcepcion(
    tenantId: string,
    destino: DestinoDescuento,
    sucursalId: string,
    porcentaje: number
  ) {
    this.validarPorcentaje(porcentaje);
    if (porcentaje === null) {
      throw new BusinessError('El porcentaje de la excepción es obligatorio.');
    }

    const existeDestino = 'tipoId' in destino
      ? await this.tipoRepo.existeEnTenant(tenantId, destino.tipoId)
      : await this.subtipoRepo.existeEnTenant(tenantId, destino.subtipoId);
    if (!existeDestino) return null;

    const sucursalValida = await this.repo.sucursalPerteneceAlTenant(sucursalId, tenantId);
    if (!sucursalValida) {
      throw new BusinessError('La sucursal seleccionada no existe.');
    }

    return this.repo.upsert(destino, sucursalId, porcentaje);
  }

  async eliminarExcepcion(tenantId: string, id: string) {
    return this.repo.delete(tenantId, id);
  }

  private validarPorcentaje(valor: number | null) {
    if (valor === null || valor === undefined) return;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }
}

export interface DescuentoResuelto {
  porcentaje: number | null;
  origen: 'subcategoria-sucursal' | 'subcategoria' | 'categoria-sucursal' | 'categoria' | 'sin-descuento';
}

interface NivelDescuento {
  descuentoGeneral: number | null;
  excepciones: { sucursalId: string; porcentaje: number }[];
}

/**
 * Resuelve qué descuento corresponde a una sucursal, de lo más específico a lo
 * más general: excepción de subcategoría, general de subcategoría, excepción de
 * categoría, general de categoría.
 *
 * Un 0 explícito es un descuento válido y corta la búsqueda; solo `null`
 * (no definido) delega al nivel siguiente.
 */
export function resolverDescuento(
  sucursalId: string,
  categoria: NivelDescuento,
  subcategoria?: NivelDescuento
): DescuentoResuelto {
  if (subcategoria) {
    const excepcionSub = subcategoria.excepciones.find((e) => e.sucursalId === sucursalId);
    if (excepcionSub) {
      return { porcentaje: Number(excepcionSub.porcentaje), origen: 'subcategoria-sucursal' };
    }
    if (subcategoria.descuentoGeneral !== null && subcategoria.descuentoGeneral !== undefined) {
      return { porcentaje: Number(subcategoria.descuentoGeneral), origen: 'subcategoria' };
    }
  }

  const excepcionCat = categoria.excepciones.find((e) => e.sucursalId === sucursalId);
  if (excepcionCat) {
    return { porcentaje: Number(excepcionCat.porcentaje), origen: 'categoria-sucursal' };
  }
  if (categoria.descuentoGeneral !== null && categoria.descuentoGeneral !== undefined) {
    return { porcentaje: Number(categoria.descuentoGeneral), origen: 'categoria' };
  }

  return { porcentaje: null, origen: 'sin-descuento' };
}
