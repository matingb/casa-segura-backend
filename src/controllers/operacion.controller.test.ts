import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { OperacionController } from './operacion.controller';
import { OperacionService } from '../services/operacion.service';
import { getTenantIdByAuthId } from '../utils/tenant';

vi.mock('../services/operacion.service');
vi.mock('../utils/tenant');

describe('OperacionController', () => {
  let controller: OperacionController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new OperacionController();
    req = {
      user: { id: AUTH_ID } as any,
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  it('debería retornar todas las operaciones cuando no se pasa limit', async () => {
    const mockData = [
      { id: 'op-1', tipo_nombre: 'Venta', sucursal_nombre: 'Central', sucursal_id: 's-1' },
    ];
    vi.mocked(OperacionService.prototype.getAll).mockResolvedValue(mockData as any);

    req.query = { sucursalId: 's-1' };
    await controller.getAll(req, res as Response);

    expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
    expect(OperacionService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID, 's-1', undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockData });
  });

  it('debería retornar operaciones paginadas con sucursalId', async () => {
    const mockResult = {
      items: [{ id: 'op-1', tipo_nombre: 'Venta', sucursal_id: 's-1' }],
      hasMore: false,
    };
    vi.mocked(OperacionService.prototype.getPaginated).mockResolvedValue(mockResult as any);

    req.query = { limit: '20', offset: '0', sucursalId: 's-1', tipoId: 't-1' };
    await controller.getAll(req, res as Response);

    expect(OperacionService.prototype.getPaginated).toHaveBeenCalledWith(
      TENANT_ID,
      20,
      0,
      's-1',
      't-1'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: mockResult.items,
      page: {
        hasMore: false,
      },
    });
  });

  it('debería filtrar únicamente por tipoId cuando no se pasa sucursalId', async () => {
    const mockResult = { items: [], hasMore: false };
    vi.mocked(OperacionService.prototype.getPaginated).mockResolvedValue(mockResult as any);

    req.query = { limit: '10', offset: '0', tipoId: 't-2' };
    await controller.getAll(req, res as Response);

    expect(OperacionService.prototype.getPaginated).toHaveBeenCalledWith(
      TENANT_ID,
      10,
      0,
      undefined,
      't-2'
    );
  });

  it('debería manejar errores y responder con 500', async () => {
    vi.mocked(getTenantIdByAuthId).mockRejectedValue(new Error('DB failure'));

    await controller.getAll(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB failure' });
  });
});
