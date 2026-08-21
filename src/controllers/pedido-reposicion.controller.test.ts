import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { PedidoReposicionController } from './pedido-reposicion.controller';
import { PedidoReposicionService } from '../services/pedido-reposicion.service';
import { getTenantIdByAuthId, getUsuarioIdByAuthId } from '../utils/tenant';

vi.mock('../services/pedido-reposicion.service');
vi.mock('../utils/tenant');

describe('PedidoReposicionController', () => {
  let controller: PedidoReposicionController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';
  const USUARIO_ID = 'usuario-123';

  beforeEach(() => {
    controller = new PedidoReposicionController();
    req = {
      user: { id: AUTH_ID } as any,
      query: {},
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
    vi.mocked(getUsuarioIdByAuthId).mockResolvedValue(USUARIO_ID);
  });

  describe('getAll', () => {
    it('debería retornar todos los pedidos cuando no se pasa limit', async () => {
      const mockData = [{ id: 'pr-1', estado: 'pendiente' }];
      vi.mocked(PedidoReposicionService.prototype.getAll).mockResolvedValue(mockData as any);

      await controller.getAll(req, res as Response);

      expect(PedidoReposicionService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID, undefined);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockData });
    });

    it('debería filtrar por sucursalId', async () => {
      const mockData: unknown[] = [];
      vi.mocked(PedidoReposicionService.prototype.getAll).mockResolvedValue(mockData as any);

      req.query = { sucursalId: 's-1' };
      await controller.getAll(req, res as Response);

      expect(PedidoReposicionService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID, 's-1');
    });

    it('debería retornar 500 ante un error', async () => {
      vi.mocked(getTenantIdByAuthId).mockRejectedValue(new Error('DB Error'));

      await controller.getAll(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });

  describe('create', () => {
    it('debería crear un pedido y retornar 201', async () => {
      const mockCreado = { id: 'pr-1', estado: 'pendiente' };
      vi.mocked(PedidoReposicionService.prototype.crear).mockResolvedValue(mockCreado as any);

      req.body = { producto_sucursal_id: 'ps-1', proveedor_id: 'prov-1', cantidad: 10 };
      await controller.create(req, res as Response);

      expect(PedidoReposicionService.prototype.crear).toHaveBeenCalledWith(TENANT_ID, USUARIO_ID, {
        producto_sucursal_id: 'ps-1',
        proveedor_id: 'prov-1',
        cantidad: 10,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCreado });
    });

    it('debería retornar 400 si falta producto_sucursal_id', async () => {
      req.body = { proveedor_id: 'prov-1', cantidad: 10 };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si falta proveedor_id', async () => {
      req.body = { producto_sucursal_id: 'ps-1', cantidad: 10 };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si cantidad es 0 o negativa', async () => {
      req.body = { producto_sucursal_id: 'ps-1', proveedor_id: 'prov-1', cantidad: 0 };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 500 ante un error genérico', async () => {
      vi.mocked(PedidoReposicionService.prototype.crear).mockRejectedValue(new Error('DB Error'));

      req.body = { producto_sucursal_id: 'ps-1', proveedor_id: 'prov-1', cantidad: 10 };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });
});
