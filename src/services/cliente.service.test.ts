import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClienteService } from './cliente.service';
import { ClienteRepository } from '../repositories/cliente.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/cliente.repository');

describe('ClienteService', () => {
  let service: ClienteService;
  const TENANT_ID = 'tenant-123';
  const SUCURSALES = ['suc-1'];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClienteService();
    // Por defecto, toda sucursal pedida es válida para el tenant.
    vi.mocked(ClienteRepository.prototype.sucursalesInvalidas).mockResolvedValue([]);
  });

  describe('createCliente', () => {
    it('debería inyectar el tenant_id y delegar en el repository', async () => {
      const data = { nombre: 'Juan Pérez', email: 'juan@example.com', sucursal_ids: SUCURSALES };
      vi.mocked(ClienteRepository.prototype.create).mockResolvedValue({ id: 'cli-1', ...data } as any);

      const result = await service.createCliente(data, TENANT_ID);

      expect(ClienteRepository.prototype.create).toHaveBeenCalledWith({ ...data, tenant_id: TENANT_ID });
      expect(result).toMatchObject({ id: 'cli-1' });
    });

    it('sin nombre: debería lanzar BusinessError y no tocar el repository', async () => {
      await expect(
        service.createCliente({ nombre: '   ', sucursal_ids: SUCURSALES } as any, TENANT_ID)
      ).rejects.toThrow(BusinessError);
      expect(ClienteRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('sin sucursales: debería lanzar BusinessError', async () => {
      await expect(
        service.createCliente({ nombre: 'Juan', sucursal_ids: [] } as any, TENANT_ID)
      ).rejects.toThrow('El cliente debe estar asociado al menos a una sucursal.');
      expect(ClienteRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('si no se manda sucursal_ids: debería lanzar BusinessError', async () => {
      await expect(
        service.createCliente({ nombre: 'Juan' } as any, TENANT_ID)
      ).rejects.toThrow('El cliente debe estar asociado al menos a una sucursal.');
    });

    it('con una sucursal de otro tenant: debería lanzar BusinessError', async () => {
      vi.mocked(ClienteRepository.prototype.sucursalesInvalidas).mockResolvedValue(['suc-ajena']);

      await expect(
        service.createCliente({ nombre: 'Juan', sucursal_ids: ['suc-ajena'] } as any, TENANT_ID)
      ).rejects.toThrow('Alguna de las sucursales seleccionadas no existe.');
      expect(ClienteRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('con un tipo_cliente inválido: debería lanzar BusinessError', async () => {
      await expect(
        service.createCliente({ nombre: 'Juan', tipo_cliente: 'ong', sucursal_ids: SUCURSALES } as any, TENANT_ID)
      ).rejects.toThrow('El tipo de cliente debe ser "persona" o "empresa".');
    });

    it('con un descuento fuera de rango: debería lanzar BusinessError', async () => {
      await expect(
        service.createCliente({ nombre: 'Juan', descuento_porcentaje: 150, sucursal_ids: SUCURSALES } as any, TENANT_ID)
      ).rejects.toThrow('El descuento debe ser un porcentaje entre 0 y 100.');
    });

    it('con un descuento en los límites: debería aceptarlo', async () => {
      vi.mocked(ClienteRepository.prototype.create).mockResolvedValue({ id: 'cli-1' } as any);

      await service.createCliente({ nombre: 'Juan', descuento_porcentaje: 0, sucursal_ids: SUCURSALES } as any, TENANT_ID);
      await service.createCliente({ nombre: 'Ana', descuento_porcentaje: 100, sucursal_ids: SUCURSALES } as any, TENANT_ID);

      expect(ClienteRepository.prototype.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateCliente', () => {
    it('si el cliente no existe: debería retornar null sin actualizar', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue(null);

      const result = await service.updateCliente('inexistente', { telefono: '123' }, TENANT_ID);

      expect(result).toBeNull();
      expect(ClienteRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('si existe: debería delegar la actualización al repository', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'cli-1' } as any);
      vi.mocked(ClienteRepository.prototype.update).mockResolvedValue({ id: 'cli-1', telefono: '123' } as any);

      const result = await service.updateCliente('cli-1', { telefono: '123' }, TENANT_ID);

      expect(ClienteRepository.prototype.update).toHaveBeenCalledWith('cli-1', { telefono: '123' }, TENANT_ID);
      expect(result).toMatchObject({ telefono: '123' });
    });

    it('una actualización parcial sin sucursal_ids: no debería exigirlas', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'cli-1' } as any);
      vi.mocked(ClienteRepository.prototype.update).mockResolvedValue({ id: 'cli-1' } as any);

      await expect(service.updateCliente('cli-1', { email: 'a@b.com' }, TENANT_ID)).resolves.not.toThrow();
      expect(ClienteRepository.prototype.sucursalesInvalidas).not.toHaveBeenCalled();
    });

    it('si intenta dejar el cliente sin sucursales: debería lanzar BusinessError', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'cli-1' } as any);

      await expect(
        service.updateCliente('cli-1', { sucursal_ids: [] }, TENANT_ID)
      ).rejects.toThrow('El cliente debe estar asociado al menos a una sucursal.');
      expect(ClienteRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('si cambia a una sucursal de otro tenant: debería lanzar BusinessError', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'cli-1' } as any);
      vi.mocked(ClienteRepository.prototype.sucursalesInvalidas).mockResolvedValue(['suc-ajena']);

      await expect(
        service.updateCliente('cli-1', { sucursal_ids: ['suc-ajena'] }, TENANT_ID)
      ).rejects.toThrow('Alguna de las sucursales seleccionadas no existe.');
    });

    it('si intenta blanquear el nombre: debería lanzar BusinessError', async () => {
      vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'cli-1' } as any);

      await expect(service.updateCliente('cli-1', { nombre: '' }, TENANT_ID)).rejects.toThrow(BusinessError);
      expect(ClienteRepository.prototype.update).not.toHaveBeenCalled();
    });
  });

  describe('desactivarCliente', () => {
    it('debería delegar la baja lógica en el repository', async () => {
      vi.mocked(ClienteRepository.prototype.desactivar).mockResolvedValue({ id: 'cli-1', activo: false } as any);

      const result = await service.desactivarCliente('cli-1', TENANT_ID);

      expect(ClienteRepository.prototype.desactivar).toHaveBeenCalledWith('cli-1', TENANT_ID);
      expect(result).toMatchObject({ activo: false });
    });
  });
});
