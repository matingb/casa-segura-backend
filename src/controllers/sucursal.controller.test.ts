import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { SucursalController } from './sucursal.controller';
import { SucursalService } from '../services/sucursal.service';
import { getTenantIdByAuthId } from '../utils/tenant';

vi.mock('../services/sucursal.service');
vi.mock('../utils/tenant');

describe('SucursalController', () => {
  let controller: SucursalController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new SucursalController();
    req = {
      user: { id: AUTH_ID } as any,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  it('debería retornar 200 y las sucursales asignadas al usuario', async () => {
    const mockSucursales = [
      {
        id: 's1',
        nombre: 'Casa Central',
        direccion: 'Av. Siempre Viva 123',
        es_central: true,
        valor_dolar: 1200,
        activo: true,
        usuario_sucursal_id: 'us-1',
        id_rol: 'rol-1',
        rol_nombre: 'Administrador',
      },
    ];

    vi.mocked(SucursalService.prototype.getByUser).mockResolvedValue(mockSucursales as any);

    await controller.getAllByUser(req as Request, res as Response);

    expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
    expect(SucursalService.prototype.getByUser).toHaveBeenCalledWith(AUTH_ID, TENANT_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockSucursales });
  });

  it('debería responder con 500 ante un error', async () => {
    vi.mocked(getTenantIdByAuthId).mockRejectedValue(new Error('DB Error'));

    await controller.getAllByUser(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
  });
});
