import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegionService } from './region.service';
import { RegionRepository, RegionRow } from '../repositories/region.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/region.repository');

describe('RegionService', () => {
  let service: RegionService;
  const TENANT_ID = 'tenant-123';
  const SUCURSAL_ID = 'suc-1';

  const region = (overrides: Partial<RegionRow> = {}): RegionRow => ({
    id: 'reg-1',
    tenant_id: TENANT_ID,
    nombre: 'Cuyo',
    descuento: 5,
    activo: true,
    sucursales: [{ id: SUCURSAL_ID, nombre: 'Central' }],
    created_at: '',
    updated_at: '',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RegionService();
    vi.mocked(RegionRepository.prototype.sucursalPerteneceAlTenant).mockResolvedValue(true);
    vi.mocked(RegionRepository.prototype.findAll).mockResolvedValue([]);
    vi.mocked(RegionRepository.prototype.sucursalesDelTenant).mockImplementation(async (ids) => ids.length);
    vi.mocked(RegionRepository.prototype.contarClientesPorSucursal).mockResolvedValue([]);
  });

  describe('crearRegion', () => {
    it('crea una región con varios puntos de venta', async () => {
      vi.mocked(RegionRepository.prototype.create).mockResolvedValue(region());

      await service.crearRegion(TENANT_ID, { nombre: '  Norte  ', descuento: 0, sucursal_ids: ['suc-1', 'suc-2', 'suc-1'] });

      expect(RegionRepository.prototype.create).toHaveBeenCalledWith(
        TENANT_ID,
        {
          nombre: 'Norte',
          descuento: 0,
          activo: true,
          sucursal_ids: ['suc-1', 'suc-2'],
        },
        undefined
      );
    });

    it('falla si el nombre está vacío', async () => {
      await expect(
        service.crearRegion(TENANT_ID, { nombre: '  ', sucursal_ids: [SUCURSAL_ID] })
      ).rejects.toThrow(BusinessError);
    });

    it('crea una región sin puntos de venta', async () => {
      vi.mocked(RegionRepository.prototype.create).mockResolvedValue(region({ sucursales: [] }));

      await service.crearRegion(TENANT_ID, { nombre: 'Norte', sucursal_ids: [] });
      await service.crearRegion(TENANT_ID, { nombre: 'Sur' });

      expect(RegionRepository.prototype.create).toHaveBeenNthCalledWith(1, TENANT_ID, expect.objectContaining({ nombre: 'Norte', sucursal_ids: [] }), undefined);
      expect(RegionRepository.prototype.create).toHaveBeenNthCalledWith(2, TENANT_ID, expect.objectContaining({ nombre: 'Sur', sucursal_ids: [] }), undefined);
    });

    it('cualquier usuario de la empresa puede crear una región sin puntos de venta', async () => {
      vi.mocked(RegionRepository.prototype.create).mockResolvedValue(region({ sucursales: [] }));
      const alcance = { authId: 'a', usuarioId: 'u', tenantId: TENANT_ID, sucursalIds: ['suc-9'], sucursalesActivasIds: ['suc-9'] };

      await service.crearRegion(TENANT_ID, { nombre: 'Norte', sucursal_ids: [] }, alcance);

      expect(RegionRepository.prototype.create).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ sucursal_ids: [] }), ['suc-9']);
    });

    it('falla si los puntos de venta no son una lista de ids', async () => {
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'Norte', sucursal_ids: 'suc-1' })
      ).rejects.toThrow('Los puntos de venta de la región no son válidos.');
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'Norte', sucursal_ids: [''] })
      ).rejects.toThrow('Los puntos de venta de la región no son válidos.');
    });

    it('falla si algún punto de venta no es de la empresa', async () => {
      vi.mocked(RegionRepository.prototype.sucursalesDelTenant).mockResolvedValue(1);
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'Norte', sucursal_ids: [SUCURSAL_ID, 'otra-suc'] })
      ).rejects.toThrow('Alguno de los puntos de venta elegidos no existe.');
    });

    it('falla si el descuento es negativo o > 100', async () => {
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'Norte', descuento: -5, sucursal_ids: [SUCURSAL_ID] })
      ).rejects.toThrow(BusinessError);
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'Norte', descuento: 105, sucursal_ids: [SUCURSAL_ID] })
      ).rejects.toThrow(BusinessError);
    });

    it('falla si ya existe una región con ese nombre en la empresa', async () => {
      vi.mocked(RegionRepository.prototype.findAll).mockResolvedValue([region({ id: 'reg-0', nombre: 'Norte' })]);
      await expect(
        service.crearRegion(TENANT_ID, { nombre: 'norte', sucursal_ids: [SUCURSAL_ID] })
      ).rejects.toThrow('Ya existe una región con ese nombre.');
    });
  });

  describe('actualizarRegion', () => {
    it('agrega puntos de venta', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(region());
      vi.mocked(RegionRepository.prototype.update).mockResolvedValue(region());

      await service.actualizarRegion('reg-1', TENANT_ID, { sucursal_ids: [SUCURSAL_ID, 'suc-2'] });

      expect(RegionRepository.prototype.update).toHaveBeenCalledWith('reg-1', TENANT_ID, { sucursal_ids: [SUCURSAL_ID, 'suc-2'] }, undefined);
    });

    it('no deja quitar un punto de venta que algún cliente usa con la región', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(
        region({ sucursales: [{ id: SUCURSAL_ID, nombre: 'Central' }, { id: 'suc-2', nombre: 'Norte' }] })
      );
      vi.mocked(RegionRepository.prototype.contarClientesPorSucursal).mockResolvedValue([{ sucursal_nombre: 'Norte', clientes: 2 }]);

      await expect(
        service.actualizarRegion('reg-1', TENANT_ID, { sucursal_ids: [SUCURSAL_ID] })
      ).rejects.toThrow('No se puede quitar de la región: Norte (2 clientes).');
      expect(RegionRepository.prototype.contarClientesPorSucursal).toHaveBeenCalledWith('reg-1', ['suc-2']);
      expect(RegionRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('deja la región sin puntos de venta si ningún cliente los usa', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(
        region({ sucursales: [{ id: SUCURSAL_ID, nombre: 'Central' }, { id: 'suc-2', nombre: 'Norte' }] })
      );
      vi.mocked(RegionRepository.prototype.update).mockResolvedValue(region({ sucursales: [] }));

      await service.actualizarRegion('reg-1', TENANT_ID, { sucursal_ids: [] });

      expect(RegionRepository.prototype.contarClientesPorSucursal).toHaveBeenCalledWith('reg-1', [SUCURSAL_ID, 'suc-2']);
      expect(RegionRepository.prototype.update).toHaveBeenCalledWith('reg-1', TENANT_ID, { sucursal_ids: [] }, undefined);
    });

    it('cualquier usuario de la empresa administra una región sin puntos de venta', async () => {
      const alcance = { authId: 'a', usuarioId: 'u', tenantId: TENANT_ID, sucursalIds: ['suc-9'], sucursalesActivasIds: ['suc-9'] };
      vi.mocked(RegionRepository.prototype.findSucursalIds).mockResolvedValue([]);
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(region({ sucursales: [] }));
      vi.mocked(RegionRepository.prototype.update).mockResolvedValue(region({ sucursales: [{ id: 'suc-9', nombre: 'Oeste' }] }));

      await service.actualizarRegion('reg-1', TENANT_ID, { sucursal_ids: ['suc-9'] }, alcance);

      expect(RegionRepository.prototype.update).toHaveBeenCalledWith('reg-1', TENANT_ID, { sucursal_ids: ['suc-9'] }, ['suc-9']);
    });

    it('una región con puntos de venta ajenos sigue sin estar disponible', async () => {
      const alcance = { authId: 'a', usuarioId: 'u', tenantId: TENANT_ID, sucursalIds: ['suc-9'], sucursalesActivasIds: ['suc-9'] };
      vi.mocked(RegionRepository.prototype.findSucursalIds).mockResolvedValue([SUCURSAL_ID]);

      await expect(
        service.actualizarRegion('reg-1', TENANT_ID, { sucursal_ids: [] }, alcance)
      ).rejects.toMatchObject({ code: 'RECURSO_NO_DISPONIBLE' });
      expect(RegionRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('permite renombrar sin chocar consigo misma', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(region());
      vi.mocked(RegionRepository.prototype.findAll).mockResolvedValue([region()]);
      vi.mocked(RegionRepository.prototype.update).mockResolvedValue(region());

      await expect(service.actualizarRegion('reg-1', TENANT_ID, { nombre: 'CUYO' })).resolves.toBeTruthy();
    });
  });

  describe('asignarRegionCliente', () => {
    it('asigna la región correctamente', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(region());
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

    it('falla si la región no incluye el punto de venta', async () => {
      vi.mocked(RegionRepository.prototype.findById).mockResolvedValue(
        region({ sucursales: [{ id: 'otra-sucursal', nombre: 'Otra' }] })
      );

      await expect(
        service.asignarRegionCliente('cli-1', SUCURSAL_ID, 'reg-1', TENANT_ID)
      ).rejects.toThrow('La región seleccionada no incluye el punto de venta indicado.');
    });
  });
});
