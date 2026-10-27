import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductoService } from './producto.service';
import { ProductoRepository } from '../repositories/producto.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/producto.repository');
vi.mock('./storage.service', () => ({ uploadProductImage: vi.fn(), getPublicUrl: vi.fn() }));

const duplicado = Object.assign(new Error('duplicate key value violates unique constraint'), {
  code: '23505',
  constraint: 'producto_tenant_id_codigo_key',
});

describe('ProductoService: código único', () => {
  let service: ProductoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductoService();
  });

  it('al crear con un código repetido devuelve un mensaje claro', async () => {
    vi.mocked(ProductoRepository.prototype.create).mockRejectedValue(duplicado);

    await expect(service.createProducto({ codigo: ' CAM-001 ', nombre: 'Cámara' } as never, 'tenant')).rejects.toThrow(
      new BusinessError('Ya existe un producto con el código "CAM-001" (puede estar eliminado). Usá otro código.')
    );
  });

  it('al editar con un código repetido devuelve el mismo mensaje', async () => {
    vi.mocked(ProductoRepository.prototype.findById).mockResolvedValue({ id: 'p1' } as never);
    vi.mocked(ProductoRepository.prototype.update).mockRejectedValue(duplicado);

    await expect(service.updateProducto('p1', { codigo: 'CAM-001' }, 'tenant')).rejects.toThrow(BusinessError);
  });

  it('no oculta otros errores de la base', async () => {
    vi.mocked(ProductoRepository.prototype.create).mockRejectedValue(new Error('conexión caída'));

    await expect(service.createProducto({ codigo: 'X', nombre: 'Y' } as never, 'tenant')).rejects.toThrow('conexión caída');
  });
});
