import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegionService } from './region.service';
import { RegionRepository } from '../repositories/region.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/region.repository');

describe('RegionService', () => {
  let service: RegionService;
  const TENANT_ID = 'tenant-123';
  const SUCURSAL_ID = 'suc-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegionService();
    vi.mocked(RegionRepository.prototype.sucursalPerteneceAlTenant).mockResolvedValue(true);
    vi.mocked(RegionRepository.prototype.findBySucursal).mockResolvedValue([]);
  });

  describe('crearRegion', () => {
    it('debe crear una región válida', async () => {
      const mockRegion = {
        id: 'reg-1',
        tenant_id: TENANT_ID,
        sucursal_id: SUCURSAL_ID,
        nombre: 'Cuyo',
        descuento: 5,
        activo: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      vi.mocked(RegionRepository.prototype.create).mockResolvedValue(mockRegion);

      const res = await service.crearRegion(TENANT_ID, {
        sucursal_id: SUCURSAL_ID,
        nombre: 'Cuyo',
        descuento: 5,
      });

      expect(res).toEqual(mockRegion);
      expect(RegionRepository.prototype.create).toHaveBeenCalledWith(TENANT_ID, {
        sucursal_id: SUCURSAL_ID,
        nombre: 'Cuyo',
        descuento: 5,
        activo: true,
      });
    });

    it('falla si el nombre está vacío', async () => {
      await expect(
        service.crearRegion(TENANT_ID, { sucursal_id: SUCURSAL_ID, nombre: '  ' })
      ).rejects.toThrow(BusinessError);
    });

    it('falla si la sucursal no pertenece al tenant', async () => {
      vi.mocked(RegionRepository.prototype.sucursalPerteneceAlTenant).mockResolvedValue(false);
      await expect(
        service.crearRegion(TENANT_ID, { sucursal_id: 'otra-suc', nombre: 'Norte' })
      ).rejects.toThrow('La sucursal seleccionada no existe.');
    });

    it('falla si el descuento es negativo o > 100', async () => {
      await expect(
        service.crearRegion(TENANT_ID, { sucursal_id: SUCURSAL_ID, nombre: 'Norte', descuento: -5 })
      ).rejects.toThrow(BusinessError);

      await expect(
        service.crearRegion(TENANT_ID, { sucursal_id: SUCURSAL_ID, nombre: 'Norte', descuento: 105 })
      ).rejects.toThrow(BusinessError);
    });

    it('falla si ya existe una región con ese nombre en la misma sucursal', async () => {
      vi.mocked(RegionRepository.prototype.findBySucursal).mockResolvedValue([
        { id: 'reg-0', tenant_id: TENANT_ID, sucursal_id: SUCURSAL_ID, nombre: 'Norte', descuento: 0, activo: true, created_at: '', updated_at: '' },
      ]);
      await expect(
        service.crearRegion(TENANT_ID, { sucursal_id: SUCURSAL_ID, nombre: 'norte' })
      ).rejects.toThrow('Ya existe una región con ese nombre en esta sucursal.');
    });
  });

  describe('asignarRegionCliente', () => {
    it('asigna la región correctamente', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue({
        id: 'reg-1',
        tenant_id: TENANT_ID,
        sucursal_id: SUCURSAL_ID,
        nombre: 'Cuyo',
        descuento: 5,
        activo: true,
        created_at: '',
        updated_at: '',
      });
      const mockAsignacion = {
        id: 'cr-1',
        cliente_id: 'cli-1',
        sucursal_id: SUCURSAL_ID,
        sucursal_nombre: 'Central',
        region_id: 'reg-1',
        region_nombre: 'Cuyo',
        descuento: 5,
        created_at: '',
      };
      vi.mocked(RegionRepository.prototype.asignarRegionCliente).mockResolvedValue(mockAsignacion);

      const res = await service.asignarRegionCliente('cli-1', SUCURSAL_ID, 'reg-1', TENANT_ID);
      expect(res).toEqual(mockAsignacion);
    });

    it('falla si la región no pertenece a la sucursal', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue({
        id: 'reg-1',
        tenant_id: TENANT_ID,
        sucursal_id: 'otra-sucursal',
        nombre: 'Cuyo',
        descuento: 5,
        activo: true,
        created_at: '',
        updated_at: '',
      });

      await expect(
        service.asignarRegionCliente('cli-1', SUCURSAL_ID, 'reg-1', TENANT_ID)
      ).rejects.toThrow('La región seleccionada no pertenece a la sucursal indicada.');
    });
  });
});
