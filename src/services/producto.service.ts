import { ProductoRepository, ProductoData, ProductoFiltros } from '../repositories/producto.repository';
import { deleteProductImage, uploadProductImage, getPublicUrl } from './storage.service';
import { BusinessError, CatalogoError } from '../utils/errors';
import { columnasMonto, escribirConMontos, MontosResueltos, validarContratoPrecio } from './precio-catalogo.service';
import { PoolClient } from 'pg';
import { withTransaction } from '../utils/db-transaction';
import { exigirSucursal, SucursalAlcance } from './sucursal-alcance.service';

export type CrearProductoData = Omit<ProductoData, 'tenant_id'> & { sucursal_ids?: string[] };
export type EditarProductoData = Partial<CrearProductoData>;

function leerSucursales(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.some(id =>
    typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new BusinessError('Seleccioná sucursales válidas.');
  }
  return [...new Set(ids.map(id => id.toLowerCase()))];
}

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

type ImagenProducto = Pick<Express.Multer.File, 'buffer' | 'mimetype'>;

async function guardarConImagen<T>(
  tenantId: string,
  productoId: string | undefined,
  imagen: ImagenProducto | undefined,
  guardar: (imagenUrl?: string) => Promise<T>,
): Promise<T> {
  if (!imagen) return guardar();

  const path = await uploadProductImage(tenantId, productoId, imagen.buffer, imagen.mimetype);
  const limpiar = () => deleteProductImage(path).catch((error: unknown) => {
    console.warn('[ProductoService] No se pudo limpiar la imagen nueva:', error);
  });
  let resultado: T;
  try {
    resultado = await guardar(getPublicUrl(path));
  } catch (error) {
    const codigo = (error as { code?: string })?.code ?? '';
    // Si se perdió la conexión al confirmar, la escritura pudo haberse aplicado.
    if (error instanceof BusinessError || /^(22|23|40)[A-Z0-9]{3}$/.test(codigo)) await limpiar();
    throw error;
  }
  if (!resultado) await limpiar();
  return resultado;
}

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
      throw new CatalogoError(
        `Ya existe un producto con el código "${String(codigo ?? '').trim()}" (puede estar eliminado). Usá otro código.`,
        'CODIGO_PRODUCTO_DUPLICADO',
        409,
      );
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

  async getProducto(id: string, tenantId: string, alcance?: SucursalAlcance) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto || !alcance || alcance.tenantId !== tenantId) return producto;
    return { ...producto, sucursales: await this.productoRepository.findSucursales(id, tenantId, alcance.sucursalIds) };
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

  async createProducto(data: CrearProductoData, tenantId: string, imagen?: ImagenProducto, alcance?: SucursalAlcance) {
    const { sucursal_ids, ...producto } = data;
    const sucursalIds = sucursal_ids === undefined ? [] : leerSucursales(sucursal_ids);
    if (sucursalIds.length > 0) {
      if (!alcance || alcance.tenantId !== tenantId) {
        throw new CatalogoError('No se pudo verificar el acceso a las sucursales.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
      }
      sucursalIds.forEach((id) => exigirSucursal(alcance, id, true));
    }
    return conCodigoUnico(producto.codigo, () => this.crear(producto, tenantId, imagen, sucursalIds, alcance));
  }

  private async crear(data: Omit<ProductoData, 'tenant_id'>, tenantId: string, imagen?: ImagenProducto,
    sucursalIds: string[] = [], alcance?: SucursalAlcance) {
    this.validarDescuentoBase(data.descuento_base);
    data = normalizarMontos(data);
    const producto = await guardarConImagen(tenantId, undefined, imagen, (imagenUrl) => {
      const datos = { ...data, tenant_id: tenantId, ...(imagenUrl ? { imagen_url: imagenUrl } : {}) };
      const guardar = async (client?: PoolClient, resueltos: MontosResueltos = {}) => {
        const creado = await this.productoRepository.create({ ...datos, ...columnasMontos(resueltos) }, client);
        if (sucursalIds.length > 0) {
          await this.productoRepository.asignarSucursales(creado.id, sucursalIds, tenantId, alcance!.authId, client!);
        }
        return creado;
      };
      if (tieneMontos(datos)) {
        return escribirConMontos(tenantId, montosDe(datos), guardar);
      }
      return sucursalIds.length > 0 ? withTransaction(guardar) : guardar();
    });
    return this.productoRepository.findById(producto.id, tenantId);
  }

  async updateProducto(id: string, data: EditarProductoData, tenantId: string, imagen?: ImagenProducto, alcance?: SucursalAlcance) {
    const { sucursal_ids, ...producto } = data;
    const sucursales = sucursal_ids === undefined ? undefined : leerSucursales(sucursal_ids);
    if (sucursales) {
      if (!alcance || alcance.tenantId !== tenantId) {
        throw new CatalogoError('No se pudo verificar el acceso a las sucursales.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
      }
      sucursales.forEach(sucursalId => exigirSucursal(alcance, sucursalId));
    }
    return conCodigoUnico(producto.codigo, () => this.actualizar(id, producto, tenantId, imagen,
      sucursales && alcance ? { ids: sucursales, alcance } : undefined));
  }

  private async actualizar(id: string, data: Partial<ProductoData>, tenantId: string, imagen?: ImagenProducto,
    seleccion?: { ids: string[]; alcance: SucursalAlcance }) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;
    if ('descuento_base' in data) {
      this.validarDescuentoBase(data.descuento_base);
    }
    data = normalizarMontos(data);
    const guardado = await guardarConImagen(tenantId, id, imagen, (imagenUrl) => {
      const datos = { ...data, ...(imagenUrl ? { imagen_url: imagenUrl } : {}) };
      const guardar = async (client: PoolClient, resueltos: MontosResueltos = {}) => {
        if (!seleccion) return this.productoRepository.update(id, { ...datos, ...columnasMontos(resueltos) }, tenantId, client);
        if (!await this.productoRepository.bloquearProducto(id, tenantId, client)) return null;
        const { ids, alcance } = seleccion;
        const actuales = await this.productoRepository.findSucursales(id, tenantId, alcance.sucursalIds, client);
        const quitar = actuales.map(sucursal => sucursal.id).filter(sucursalId => !ids.includes(sucursalId));
        const agregar = ids.filter(sucursalId => !actuales.some(sucursal => sucursal.id === sucursalId));
        if (quitar.length) await this.productoRepository.quitarSucursales(id, quitar, tenantId, alcance.authId, client);
        if (agregar.length) await this.productoRepository.asignarSucursales(id, agregar, tenantId, alcance.authId, client);
        return await this.productoRepository.update(id, { ...datos, ...columnasMontos(resueltos) }, tenantId, client) ?? producto;
      };
      if (tieneMontos(datos)) {
        return escribirConMontos(tenantId, montosDe(datos), guardar);
      }
      if (seleccion) return withTransaction(guardar);
      return this.productoRepository.update(id, datos, tenantId);
    });
    return guardado ? this.getProducto(id, tenantId, seleccion?.alcance) : null;
  }

  async uploadImage(id: string, tenantId: string, buffer: Buffer, mimetype: string) {
    const producto = await this.productoRepository.findById(id, tenantId);
    if (!producto) return null;

    const storagePath = await uploadProductImage(tenantId, id, buffer, mimetype);
    const publicUrl = getPublicUrl(storagePath);
    const guardado = await this.productoRepository.updateImagePath(id, publicUrl, tenantId);
    return guardado ? publicUrl : null;
  }

  async eliminarProducto(id: string, tenantId: string) {
    return this.productoRepository.softDelete(id, tenantId);
  }
}

