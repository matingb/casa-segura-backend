import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteService } from './cliente.service';
import { ClienteRepository } from '../repositories/cliente.repository';

vi.mock('../repositories/cliente.repository');

describe('Provincia del cliente', () => {
  const service = new ClienteService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ClienteRepository.prototype.sucursalesInvalidas).mockResolvedValue([]);
    vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'c1', provincia: 'Buenos Aires' });
  });

  it('ofrece el catálogo completo aunque todavía no haya clientes', async () => {
    const provincias = await service.getValoresUnicos('tenant', 'provincia');
    expect(provincias).toHaveLength(24);
    expect(provincias).toContain('Ciudad Autónoma de Buenos Aires');
    expect(ClienteRepository.prototype.findValoresUnicos).not.toHaveBeenCalled();
  });

  it('normaliza la provincia al crear', async () => {
    await service.createCliente({ nombre: 'Cliente', provincia: 'cordoba', sucursal_ids: ['s1'] }, 'tenant');
    expect(ClienteRepository.prototype.create).toHaveBeenCalledWith(
      expect.objectContaining({ provincia: 'Córdoba' }), undefined, undefined,
    );
  });

  it('rechaza texto libre inválido al crear y editar', async () => {
    await expect(service.createCliente({ nombre: 'Cliente', provincia: 'Rosario', sucursal_ids: ['s1'] }, 'tenant'))
      .rejects.toThrow('Seleccioná una provincia argentina válida');
    await expect(service.updateCliente('c1', { provincia: 'Rosario' }, 'tenant'))
      .rejects.toThrow('Seleccioná una provincia argentina válida');
    expect(ClienteRepository.prototype.create).not.toHaveBeenCalled();
    expect(ClienteRepository.prototype.update).not.toHaveBeenCalled();
  });

  it('normaliza una provincia editada y permite quitarla', async () => {
    await service.updateCliente('c1', { provincia: 'CABA' }, 'tenant');
    expect(ClienteRepository.prototype.update).toHaveBeenLastCalledWith('c1', { provincia: 'Ciudad Autónoma de Buenos Aires' }, 'tenant');
    await service.updateCliente('c1', { provincia: '' }, 'tenant');
    expect(ClienteRepository.prototype.update).toHaveBeenLastCalledWith('c1', { provincia: null }, 'tenant');
  });

  it('conserva un valor anterior desconocido al editar otros datos', async () => {
    vi.mocked(ClienteRepository.prototype.findById).mockResolvedValue({ id: 'c1', provincia: 'Valor histórico' });
    await service.updateCliente('c1', { provincia: 'Valor histórico', telefono: '123' }, 'tenant');
    expect(ClienteRepository.prototype.update).toHaveBeenCalledWith('c1', { telefono: '123' }, 'tenant');
  });

  it('valida también las ediciones con alcance de sucursales autenticado', async () => {
    await service.updateCliente('c1', { provincia: 'cordoba' }, 'tenant', {
      tenantId: 'tenant', authId: 'auth', usuarioId: 'u1', sucursalIds: ['s1'], sucursalesActivasIds: ['s1'],
    });
    expect(ClienteRepository.prototype.updateEnAlcance).toHaveBeenCalledWith(
      'c1', { provincia: 'Córdoba' }, 'tenant', ['s1'], ['s1'], 'auth',
    );
  });
});
