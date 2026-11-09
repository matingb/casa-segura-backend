import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductoService } from './producto.service';
import { ProductoRepository } from '../repositories/producto.repository';
import { deleteProductImage, getPublicUrl, uploadProductImage } from './storage.service';

vi.mock('../repositories/producto.repository');
vi.mock('./storage.service', () => ({ uploadProductImage: vi.fn(), getPublicUrl: vi.fn(), deleteProductImage: vi.fn() }));

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
