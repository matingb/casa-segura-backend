import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SucursalService } from './sucursal.service';
import { SucursalRepository } from '../repositories/sucursal.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/sucursal.repository');

describe('SucursalService', () => {
  let service: SucursalService;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SucursalService();
    vi.mocked(SucursalRepository.prototype.contarActivas).mockResolvedValue(3);
  });

  describe('create', () => {
    it('crea con los datos validados', async () => {
      vi.mocked(SucursalRepository.prototype.create).mockResolvedValue({ id: 's1' } as any);

      await service.create(TENANT, { nombre: 'Sucursal Sur', valor_dolar: 1200, descuento: 5 });

      expect(SucursalRepository.prototype.create).toHaveBeenCalledWith(TENANT, {
        nombre: 'Sucursal Sur',
        valor_dolar: 1200,
        descuento: 5,
      });
    });

    it('rechaza nombre vacío', async () => {
      await expect(service.create(TENANT, { nombre: '   ' })).rejects.toThrow(
        'El nombre de la sucursal es obligatorio.'
      );
      expect(SucursalRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('rechaza un valor del dólar negativo', async () => {
      await expect(
        service.create(TENANT, { nombre: 'Sur', valor_dolar: -10 })
      ).rejects.toThrow('El valor del dólar debe ser un número positivo.');
    });

    it('rechaza un descuento fuera de rango', async () => {
      await expect(
        service.create(TENANT, { nombre: 'Sur', descuento: 150 })
      ).rejects.toThrow('El descuento debe ser un porcentaje entre 0 y 100.');
    });

    it('acepta descuento y valor del dólar nulos', async () => {
      vi.mocked(SucursalRepository.prototype.create).mockResolvedValue({ id: 's1' } as any);

      await expect(
        service.create(TENANT, { nombre: 'Sur', descuento: null, valor_dolar: null })
      ).resolves.toBeTruthy();
    });
  });

  describe('update', () => {
    it('si no existe: retorna null sin actualizar', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue(null);

      const r = await service.update('x', TENANT, { nombre: 'Nueva' });

      expect(r).toBeNull();
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('actualiza una sucursal existente', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({ id: 's1', activo: true } as any);
      vi.mocked(SucursalRepository.prototype.update).mockResolvedValue({ id: 's1' } as any);

      await service.update('s1', TENANT, { descuento: 8 });

      expect(SucursalRepository.prototype.update).toHaveBeenCalledWith('s1', TENANT, { descuento: 8 });
    });

    it('reactivar no pasa por las reglas de baja', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: false,
        es_central: true,
      } as any);
      vi.mocked(SucursalRepository.prototype.update).mockResolvedValue({ id: 's1' } as any);

      await expect(service.update('s1', TENANT, { activo: true })).resolves.toBeTruthy();
    });

    it('desactivar por update respeta la regla de la casa central', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: true,
        es_central: true,
      } as any);

      await expect(service.update('s1', TENANT, { activo: false })).rejects.toThrow(
        'No se puede dar de baja la casa central. Designá otra sucursal como central primero.'
      );
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });
  });

  describe('desactivar', () => {
    it('da de baja una sucursal común', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's2',
        activo: true,
        es_central: false,
      } as any);
      vi.mocked(SucursalRepository.prototype.desactivar).mockResolvedValue({ id: 's2', activo: false } as any);

      const r = await service.desactivar('s2', TENANT);

      expect(r).toMatchObject({ activo: false });
    });

    it('no permite dar de baja la casa central', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: true,
        es_central: true,
      } as any);

      await expect(service.desactivar('s1', TENANT)).rejects.toThrow(BusinessError);
      expect(SucursalRepository.prototype.desactivar).not.toHaveBeenCalled();
    });

    it('no permite dejar al tenant sin sucursales activas', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's2',
        activo: true,
        es_central: false,
      } as any);
      vi.mocked(SucursalRepository.prototype.contarActivas).mockResolvedValue(1);

      await expect(service.desactivar('s2', TENANT)).rejects.toThrow(
        'No se puede dar de baja la única sucursal activa.'
      );
    });

    it('si ya estaba inactiva: no vuelve a escribir', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's3',
        activo: false,
        es_central: false,
      } as any);

      const r = await service.desactivar('s3', TENANT);

      expect(r).toMatchObject({ activo: false });
      expect(SucursalRepository.prototype.desactivar).not.toHaveBeenCalled();
    });

    it('si no existe: retorna null', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue(null);

      expect(await service.desactivar('x', TENANT)).toBeNull();
    });
  });
});
