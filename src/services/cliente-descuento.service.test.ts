import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClienteDescuentoService } from './cliente-descuento.service';
import { ClienteDescuentoRepository } from '../repositories/cliente-descuento.repository';
import { ClienteRepository } from '../repositories/cliente.repository';
import { TipoRepository } from '../repositories/tipo.repository';
import { SubtipoRepository } from '../repositories/subtipo.repository';
import { RegionRepository } from '../repositories/region.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/cliente-descuento.repository');
vi.mock('../repositories/cliente.repository');
vi.mock('../repositories/tipo.repository');
vi.mock('../repositories/subtipo.repository');
vi.mock('../repositories/region.repository');

describe('ClienteDescuentoService', () => {
  let service: ClienteDescuentoService;
  const TENANT_ID = 'tenant-123';
  const CLIENTE_ID = 'cli-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClienteDescuentoService();
    vi.mocked(ClienteDescuentoRepository.prototype.existeCliente).mockResolvedValue(true);
    vi.mocked(ClienteDescuentoRepository.prototype.existeProducto).mockResolvedValue(true);
    vi.mocked(TipoRepository.prototype.existeEnTenant).mockResolvedValue(true);
    vi.mocked(SubtipoRepository.prototype.existeEnTenant).mockResolvedValue(true);
  });

  describe('asignarDescuentoCategoria', () => {
    it('debe asignar descuento por tipo', async () => {
      const mockResult = {
        id: 'cdc-1',
        cliente_id: CLIENTE_ID,
        tipo_id: 'tipo-1',
        tipo_nombre: 'Alarmas',
        subtipo_id: null,
        subtipo_nombre: null,
        categoria_padre_id: null,
        categoria_padre_nombre: null,
        porcentaje: 12.5,
        nota: 'Promo cliente',
        created_at: '',
        updated_at: '',
      };
      vi.mocked(ClienteDescuentoRepository.prototype.upsertCategoria).mockResolvedValue(mockResult);

      const res = await service.asignarDescuentoCategoria(
        CLIENTE_ID,
        TENANT_ID,
        { tipoId: 'tipo-1' },
        12.5,
        'Promo cliente'
      );

      expect(res).toEqual(mockResult);
      expect(ClienteDescuentoRepository.prototype.upsertCategoria).toHaveBeenCalledWith(
        CLIENTE_ID,
        { tipoId: 'tipo-1' },
        12.5,
        'Promo cliente'
      );
    });

    it('falla si el porcentaje es inválido', async () => {
      await expect(
        service.asignarDescuentoCategoria(CLIENTE_ID, TENANT_ID, { tipoId: 'tipo-1' }, -1)
      ).rejects.toThrow(BusinessError);

      await expect(
        service.asignarDescuentoCategoria(CLIENTE_ID, TENANT_ID, { tipoId: 'tipo-1' }, 101)
      ).rejects.toThrow(BusinessError);
    });

    it('falla si la categoría no existe en el tenant', async () => {
      vi.mocked(TipoRepository.prototype.existeEnTenant).mockResolvedValue(false);
      await expect(
        service.asignarDescuentoCategoria(CLIENTE_ID, TENANT_ID, { tipoId: 'tipo-inexistente' }, 10)
      ).rejects.toThrow('La categoría o subcategoría seleccionada no existe.');
    });
  });

  describe('asignarDescuentoProducto', () => {
    it('debe asignar descuento por producto', async () => {
      const mockResult = {
        id: 'cdp-1',
        cliente_id: CLIENTE_ID,
        producto_id: 'prod-1',
        producto_codigo: 'P01',
        producto_nombre: 'Sensor Pir',
        producto_precio_base: 5000,
        porcentaje: 20,
        nota: null,
        created_at: '',
        updated_at: '',
      };
      vi.mocked(ClienteDescuentoRepository.prototype.upsertProducto).mockResolvedValue(mockResult);

      const res = await service.asignarDescuentoProducto(
        CLIENTE_ID,
        TENANT_ID,
        'prod-1',
        20
      );

      expect(res).toEqual(mockResult);
    });

    it('falla si el producto no existe en el tenant', async () => {
      vi.mocked(ClienteDescuentoRepository.prototype.existeProducto).mockResolvedValue(false);
      await expect(
        service.asignarDescuentoProducto(CLIENTE_ID, TENANT_ID, 'prod-inexistente', 15)
      ).rejects.toThrow('El producto seleccionado no existe.');
    });
  });

  describe('getDescuentosCliente', () => {
    it('debe retornar descuentos acumulados del cliente incluyendo descuento general', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({
        id: CLIENTE_ID,
        tenant_id: TENANT_ID,
        nombre: 'Acme Corp',
        descuento_porcentaje: 8,
      } as any);

      vi.mocked(RegionRepository.prototype.findRegionesPorCliente).mockResolvedValue([]);
      vi.mocked(ClienteDescuentoRepository.prototype.findCategoriasByCliente).mockResolvedValue([]);
      vi.mocked(ClienteDescuentoRepository.prototype.findProductosByCliente).mockResolvedValue([]);

      const res = await service.getDescuentosCliente(CLIENTE_ID, TENANT_ID);

      expect(res).toEqual({
        clienteId: CLIENTE_ID,
        descuentoGeneral: 8,
        regiones: [],
        categorias: [],
        productos: [],
      });
    });
  });
});
