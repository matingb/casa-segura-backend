import { ProductoRepository, ProductoData, ProductoFiltros } from '../repositories/producto.repository';
import { uploadProductImage, getPublicUrl } from './storage.service';
import { BusinessError } from '../utils/errors';
import { columnasMonto, escribirConMontos, MontosResueltos, validarContratoPrecio } from './precio-catalogo.service';

const CAMPOS_PRECIO = ['precio_base', 'precio_base_usd', 'moneda_precio_base'];
const CAMPOS_COSTO = ['costo_reposicion_base_usd', 'moneda_costo_reposicion_base'];

/** Columnas de producto que surgen del precio y del costo resueltos. */
function columnasMontos({ precio, costo }: MontosResueltos): Partial<ProductoData> {
  const p = precio && columnasMonto(precio);
  const c = costo && columnasMonto(costo);
  return {
    ...(p ? { precio_base: p.ars, precio_base_usd: p.usd, moneda_precio_base: p.moneda } : {}),
    ...(c ? { costo_reposicion_base: c.ars, costo_reposicion_base_usd: c.usd, moneda_costo_reposicion_base: c.moneda } : {}),
  };
}

/**
 * Valida los campos monetarios crudos y normaliza el contrato anterior: un
 * `costo_reposicion_base` numérico sin `costo` es un principal ARS.
 */
function normalizarMontos<T extends Partial<ProductoData>>(data: T): T {
  validarContratoPrecio(data, CAMPOS_PRECIO);
  validarContratoPrecio(data, CAMPOS_COSTO, 'Cargá el costo de reposición con su moneda de referencia.');
  if ('costo' in data) {
    const resto = { ...data };
    delete resto.costo_reposicion_base;
    return resto;
  }
  if ('costo_reposicion_base' in data) {
    return { ...data, moneda_costo_reposicion_base: 'ARS', costo_reposicion_base_usd: null };
  }
  return data;
}

const tieneMontos = (data: Partial<ProductoData>) => 'precio' in data || 'costo' in data;
const montosDe = (data: Partial<ProductoData>) => ({
  ...('precio' in data ? { precio: data.precio ?? null } : {}),
  ...('costo' in data ? { costo: data.costo ?? null } : {}),
});

/**
 * El código es único por empresa, también contra productos eliminados (la
 * restricción de la base no los excluye): se traduce el error a un mensaje claro.
 */
async function conCodigoUnico<T>(codigo: unknown, guardar: () => Promise<T>): Promise<T> {
  try {
    return await guardar();
  } catch (error: unknown) {
    const pg = error as { code?: string; constraint?: string };
    if (pg?.code === '23505' && pg.constraint === 'producto_tenant_id_codigo_key') {
      throw new BusinessError(`Ya existe un producto con el código "${String(codigo ?? '').trim()}" (puede estar eliminado). Usá otro código.`);
    }
    throw error;
  }
}

export class ProductoService {
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoRepository = new ProductoRepository();
  }

  async getAllProductos(tenantId: string, operativo = false) {
    return this.productoRepository.findAll(tenantId, operativo);
  }

  async getPaginated(tenantId: string, limit: number, offset: number, search?: string) {
    return this.productoRepository.findPaginated(tenantId, limit, offset, search);
  }

  async getPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    filtros?: ProductoFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    return this.productoRepository.findPaginatedWithTotal(tenantId, limit, offset, search, filtros, sortBy, sortDir);
  }

  async getValoresUnicos(tenantId: string, campo: string) {
    return this.productoRepository.findValoresUnicos(tenantId, campo);
  }

  async getProducto(id: string, tenantId: string) {
    return this.productoRepository.findById(id, tenantId);
  }

  /**
   * Descuento general del producto (nivel 3 de la cascada). Solo se valida el
   * rango: el tope real por margen mínimo depende de la sucursal y se resuelve
   * al calcular la lista de precios.
   */
  private validarDescuentoBase(descuento: unknown) {
    if (descuento === null || descuento === undefined) return;
    const valor = Number(descuento);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
    }
  }

  async createProducto(data: Omit<ProductoData, 'tenant_id'>, tenantId: string) {
    return conCodigoUnico(data.codigo, () => this.crear(data, tenantId));
  }

  private async crear(data: Omit<ProductoData, 'tenant_id'>, tenantId: string) {
    this.validarDescuentoBase(data.descuento_base);
    data = normalizarMontos(data);
    if (tieneMontos(data)) {
      const producto = await escribirConMontos(tenantId, montosDe(data), (client, resueltos) =>
        this.productoRepository.create({ ...data, tenant_id: tenantId, ...columnasMontos(resueltos) }, client));
      return this.productoRepository.findById(producto.id, tenantId);
    }
    const producto = await this.productoRepository.create({ ...data, tenant_id: tenantId });
    return this.productoRepository.findById(producto.id, tenantId);
  }

  async updateProducto(id: string, data: Partial<ProductoData>, tenantId: string) {
    return conCodigoUnico(data.codigo, () => this.actualizar(id, data, tenantId));
  }

  private async actualizar(id: string, data: Partial<ProductoData>, tenantId: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;
    if ('descuento_base' in data) {
      this.validarDescuentoBase(data.descuento_base);
    }
    data = normalizarMontos(data);
    if (tieneMontos(data)) {
      await escribirConMontos(tenantId, montosDe(data), (client, resueltos) =>
        this.productoRepository.update(id, { ...data, ...columnasMontos(resueltos) }, tenantId, client));
      return this.productoRepository.findById(id, tenantId);
    }
    const guardado = await this.productoRepository.update(id, data, tenantId);
    return guardado ? this.productoRepository.findById(id, tenantId) : null;
  }

  async uploadImage(id: string, tenantId: string, buffer: Buffer, mimetype: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;

    const storagePath = await uploadProductImage(tenantId, id, buffer, mimetype);
    const publicUrl = getPublicUrl(storagePath);
    await this.productoRepository.updateImagePath(id, publicUrl, tenantId);
    
    return publicUrl;
  }

  async eliminarProducto(id: string, tenantId: string) {
    return this.productoRepository.softDelete(id, tenantId);
  }
}

