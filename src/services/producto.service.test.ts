import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductoService } from './producto.service';
import { ProductoRepository } from '../repositories/producto.repository';
import { deleteProductImage, getPublicUrl, uploadProductImage } from './storage.service';
import { pool } from '../config/db';
import { SucursalAlcance } from './sucursal-alcance.service';
import { CotizacionRepository } from '../repositories/cotizacion.repository';

vi.mock('../repositories/producto.repository');
vi.mock('./storage.service', () => ({ uploadProductImage: vi.fn(), getPublicUrl: vi.fn(), deleteProductImage: vi.fn() }));
vi.mock('../config/db', () => ({ pool: { connect: vi.fn() } }));
vi.mock('../repositories/cotizacion.repository');

const duplicado = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
  constraint: 'producto_tenant_id_codigo_key',
});

describe('ProductoService: reemplazo de imagen', () => {
  const imagen = { buffer: Buffer.from('imagen de prueba'), mimetype: 'image/png' };
  const path = 'tenant/p1/nueva';
  const url = 'https://storage.example.test/productos/' + path;
  const service = new ProductoService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProductoRepository.prototype.findById).mockResolvedValue({ id: 'p1' });
    vi.mocked(uploadProductImage).mockResolvedValue(path);
    vi.mocked(getPublicUrl).mockReturnValue(url);
    vi.mocked(deleteProductImage).mockResolvedValue(undefined);
  });

  it('guarda la nueva URL junto con el resto de la edición', async () => {
    vi.mocked(ProductoRepository.prototype.update).mockResolvedValue({ id: 'p1', imagen_url: url });

    await service.updateProducto('p1', { nombre: 'Cámara', imagen_url: 'anterior' }, 'tenant', imagen);

    expect(uploadProductImage).toHaveBeenCalledWith('tenant', 'p1', imagen.buffer, imagen.mimetype);
    expect(ProductoRepository.prototype.update).toHaveBeenCalledWith('p1', { nombre: 'Cámara', imagen_url: url }, 'tenant');
    expect(deleteProductImage).not.toHaveBeenCalled();
  });

  it('limpia solo la imagen nueva cuando la edición falla por código duplicado', async () => {
    vi.mocked(ProductoRepository.prototype.update).mockRejectedValue(duplicado);

    await expect(service.updateProducto('p1', { codigo: 'CAM-001' }, 'tenant', imagen))
      .rejects.toMatchObject({ code: 'CODIGO_PRODUCTO_DUPLICADO' });

    expect(deleteProductImage).toHaveBeenCalledExactlyOnceWith(path);
  });
});

describe('ProductoService: código único', () => {
  let service: ProductoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductoService();
  });

  it('al crear con un código repetido devuelve un mensaje claro', async () => {
    vi.mocked(ProductoRepository.prototype.create).mockRejectedValue(duplicado);

    await expect(service.createProducto({ codigo: ' CAM-001 ', nombre: 'Cámara' } as never, 'tenant')).rejects.toMatchObject({
      code: 'CODIGO_PRODUCTO_DUPLICADO',
      status: 409,
      message: 'Ya existe un producto con el código "CAM-001" (puede estar eliminado). Usá otro código.',
    });
  });

  it('al editar con un código repetido devuelve el mismo mensaje', async () => {
    vi.mocked(ProductoRepository.prototype.findById).mockResolvedValue({ id: 'p1' } as never);
    vi.mocked(ProductoRepository.prototype.update).mockRejectedValue(duplicado);

    await expect(service.updateProducto('p1', { codigo: 'CAM-001' }, 'tenant')).rejects.toMatchObject({
      code: 'CODIGO_PRODUCTO_DUPLICADO',
      status: 409,
    });
  });

  it('no oculta otros errores de la base', async () => {
    vi.mocked(ProductoRepository.prototype.create).mockRejectedValue(new Error('conexión caída'));

    await expect(service.createProducto({ codigo: 'X', nombre: 'Y' } as never, 'tenant')).rejects.toThrow('conexión caída');
  });
});

describe('ProductoService: sucursales en el alta', () => {
  const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
  const alcance: SucursalAlcance = {
    authId: 'auth', usuarioId: 'usuario', tenantId: 'tenant', sucursalIds: ids, sucursalesActivasIds: ids,
  };
  const client = { query: vi.fn(), release: vi.fn() };
  const data = { codigo: 'NUEVO', nombre: 'Cámara', sucursal_ids: ids };
  let service: ProductoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductoService();
    client.query.mockResolvedValue({ rows: [] });
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    vi.mocked(ProductoRepository.prototype.create).mockResolvedValue({ id: 'p1' });
    vi.mocked(ProductoRepository.prototype.findById).mockResolvedValue({ id: 'p1' });
    vi.mocked(ProductoRepository.prototype.asignarSucursales).mockResolvedValue(undefined);
  });

  it('crea el producto y todas sus asignaciones en la misma transacción', async () => {
    await service.createProducto(data, 'tenant', undefined, alcance);
    expect(ProductoRepository.prototype.create).toHaveBeenCalledWith(expect.not.objectContaining({ sucursal_ids: ids }), client);
    expect(ProductoRepository.prototype.asignarSucursales).toHaveBeenCalledWith('p1', ids, 'tenant', 'auth', client);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('revierte también el producto si falla una asignación', async () => {
    vi.mocked(ProductoRepository.prototype.asignarSucursales).mockRejectedValue(new Error('sucursal no disponible'));
    await expect(service.createProducto(data, 'tenant', undefined, alcance)).rejects.toThrow('sucursal no disponible');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(ProductoRepository.prototype.findById).not.toHaveBeenCalled();
  });

  it('resuelve el precio y asigna sucursales dentro de una sola transacción', async () => {
    vi.mocked(CotizacionRepository.prototype.obtener).mockResolvedValue({
      cotizacion_usd_ars: '1000.000000', cotizacion_version: '3',
    } as never);
    await service.createProducto({ ...data, precio: {
      moneda_referencia: 'USD', importe_referencia: '10', cotizacion_version: '3',
    } }, 'tenant', undefined, alcance);
    expect(ProductoRepository.prototype.create).toHaveBeenCalledWith(expect.objectContaining({ precio_base_usd: '10.0000', precio_base: '10000.00' }), client);
    expect(ProductoRepository.prototype.asignarSucursales).toHaveBeenCalledWith('p1', ids, 'tenant', 'auth', client);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
  });

  it('elimina IDs repetidos y conserva el alta sin sucursales', async () => {
    await service.createProducto({ ...data, sucursal_ids: [ids[0], ids[0]] }, 'tenant', undefined, alcance);
    expect(ProductoRepository.prototype.asignarSucursales).toHaveBeenCalledWith('p1', [ids[0]], 'tenant', 'auth', client);
    vi.clearAllMocks();
    await service.createProducto({ codigo: 'OTRO', nombre: 'Cámara' }, 'tenant');
    expect(pool.connect).not.toHaveBeenCalled();
    expect(ProductoRepository.prototype.asignarSucursales).not.toHaveBeenCalled();
  });

  it('rechaza sucursales ajenas, inactivas o sin alcance autenticado antes de guardar', async () => {
    await expect(service.createProducto(data, 'tenant', undefined, { ...alcance, sucursalesActivasIds: [ids[0]] }))
      .rejects.toMatchObject({ code: 'SUCURSAL_FUERA_DE_ALCANCE', status: 403 });
    await expect(service.createProducto(data, 'tenant')).rejects.toMatchObject({ status: 403 });
    expect(ProductoRepository.prototype.create).not.toHaveBeenCalled();
  });

  it.each([null, 'todas', ['invalida'], [null]])('rechaza una selección mal formada (%j)', async (sucursal_ids) => {
    await expect(service.createProducto({ ...data, sucursal_ids } as never, 'tenant', undefined, alcance))
      .rejects.toThrow('Seleccioná sucursales válidas.');
    expect(ProductoRepository.prototype.create).not.toHaveBeenCalled();
  });
});
