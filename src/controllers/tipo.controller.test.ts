import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { TipoController } from './tipo.controller';
import { TipoService } from '../services/tipo.service';
import { getTenantIdByAuthId } from '../utils/tenant';

vi.mock('../services/tipo.service');
vi.mock('../utils/tenant');

describe('TipoController', () => {
  let controller: TipoController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new TipoController();
    req = {
      user: { id: AUTH_ID } as any,
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  describe('getAll', () => {
    it('debería retornar 200 y la lista de tipos', async () => {
      const mockTipos = [{ id: 't1', nombre: 'Herramientas', subtipos: [] }];
      vi.mocked(TipoService.prototype.getAll).mockResolvedValue(mockTipos as any);

      await controller.getAll(req as Request, res as Response);

      expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(TipoService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockTipos });
    });

    it('debería retornar 500 si ocurre un error', async () => {
      vi.mocked(TipoService.prototype.getAll).mockRejectedValue(new Error('DB Error'));

      await controller.getAll(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });

  describe('create', () => {
    it('debería retornar 400 si nombre está vacío', async () => {
      req.body = { nombre: '   ' };

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'El campo "nombre" es requerido' });
    });

    it('debería retornar 201 con el tipo creado', async () => {
      req.body = { nombre: 'Seguridad' };
      const createdTipo = { id: 't2', nombre: 'Seguridad', tenant_id: TENANT_ID };
      vi.mocked(TipoService.prototype.create).mockResolvedValue(createdTipo as any);

      await controller.create(req as Request, res as Response);

      expect(TipoService.prototype.create).toHaveBeenCalledWith(TENANT_ID, 'Seguridad');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: createdTipo });
    });

    it('debería retornar 500 si ocurre un error al crear', async () => {
      req.body = { nombre: 'Seguridad' };
      vi.mocked(TipoService.prototype.create).mockRejectedValue(new Error('Insert error'));

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Insert error' });
    });
  });

  describe('delete', () => {
    it('debería retornar 200 con el tipo eliminado si existe', async () => {
      req.params = { id: 't1' };
      const deletedTipo = { id: 't1', nombre: 'Herramientas' };
      vi.mocked(TipoService.prototype.delete).mockResolvedValue(deletedTipo as any);

      await controller.delete(req, res as Response);

      expect(TipoService.prototype.delete).toHaveBeenCalledWith(TENANT_ID, 't1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: deletedTipo });
    });

    it('debería retornar 404 si el tipo no existe', async () => {
      req.params = { id: 't-inexistente' };
      vi.mocked(TipoService.prototype.delete).mockResolvedValue(null);

      await controller.delete(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Tipo no encontrado' });
    });

    it('debería retornar 500 si ocurre un error al eliminar', async () => {
      req.params = { id: 't1' };
      vi.mocked(TipoService.prototype.delete).mockRejectedValue(new Error('Delete error'));

      await controller.delete(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Delete error' });
    });
  });
});
