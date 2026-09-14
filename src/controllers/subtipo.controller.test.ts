import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { SubtipoController } from './subtipo.controller';
import { SubtipoService } from '../services/subtipo.service';
import { getTenantIdByAuthId } from '../utils/tenant';

vi.mock('../services/subtipo.service');
vi.mock('../utils/tenant');

describe('SubtipoController', () => {
  let controller: SubtipoController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new SubtipoController();
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
    it('debería retornar 200 y la lista de subtipos', async () => {
      const mockSubtipos = [{ id: 's1', tipo_id: 't1', nombre: 'Candados', tipo_nombre: 'Seguridad' }];
      vi.mocked(SubtipoService.prototype.getAll).mockResolvedValue(mockSubtipos as any);

      await controller.getAll(req as Request, res as Response);

      expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(SubtipoService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockSubtipos });
    });

    it('debería retornar 500 si ocurre un error', async () => {
      vi.mocked(SubtipoService.prototype.getAll).mockRejectedValue(new Error('DB Error'));

      await controller.getAll(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });

  describe('create', () => {
    it('debería retornar 400 si tipo_id falta', async () => {
      req.body = { nombre: 'Candados' };

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'El campo "tipo_id" es requerido' });
    });

    it('debería retornar 400 si nombre está vacío', async () => {
      req.body = { tipo_id: 't1', nombre: '   ' };

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'El campo "nombre" es requerido' });
    });

    it('debería retornar 404 si el tipo no pertenece al tenant', async () => {
      req.body = { tipo_id: 't-ajeno', nombre: 'Candados' };
      vi.mocked(SubtipoService.prototype.create).mockResolvedValue(null);

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Tipo no encontrado o no pertenece al tenant' });
    });

    it('debería retornar 201 con el subtipo creado', async () => {
      req.body = { tipo_id: 't1', nombre: 'Candados' };
      const createdSubtipo = { id: 's2', tipo_id: 't1', nombre: 'Candados' };
      vi.mocked(SubtipoService.prototype.create).mockResolvedValue(createdSubtipo as any);

      await controller.create(req as Request, res as Response);

      expect(SubtipoService.prototype.create).toHaveBeenCalledWith(TENANT_ID, 't1', 'Candados');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: createdSubtipo });
    });

    it('debería aceptar tipoId en camelCase', async () => {
      req.body = { tipoId: 't1', nombre: 'Alarmas' };
      const createdSubtipo = { id: 's3', tipo_id: 't1', nombre: 'Alarmas' };
      vi.mocked(SubtipoService.prototype.create).mockResolvedValue(createdSubtipo as any);

      await controller.create(req as Request, res as Response);

      expect(SubtipoService.prototype.create).toHaveBeenCalledWith(TENANT_ID, 't1', 'Alarmas');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: createdSubtipo });
    });

    it('debería retornar 500 si ocurre un error al crear', async () => {
      req.body = { tipo_id: 't1', nombre: 'Candados' };
      vi.mocked(SubtipoService.prototype.create).mockRejectedValue(new Error('Insert error'));

      await controller.create(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Insert error' });
    });
  });

  describe('delete', () => {
    it('debería retornar 200 con el subtipo eliminado si existe', async () => {
      req.params = { id: 's1' };
      const deletedSubtipo = { id: 's1', nombre: 'Candados', tipo_id: 't1' };
      vi.mocked(SubtipoService.prototype.delete).mockResolvedValue(deletedSubtipo as any);

      await controller.delete(req, res as Response);

      expect(SubtipoService.prototype.delete).toHaveBeenCalledWith(TENANT_ID, 's1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: deletedSubtipo });
    });

    it('debería retornar 404 si el subtipo no existe', async () => {
      req.params = { id: 's-inexistente' };
      vi.mocked(SubtipoService.prototype.delete).mockResolvedValue(null);

      await controller.delete(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Subtipo no encontrado' });
    });

    it('debería retornar 500 si ocurre un error al eliminar', async () => {
      req.params = { id: 's1' };
      vi.mocked(SubtipoService.prototype.delete).mockRejectedValue(new Error('Delete error'));

      await controller.delete(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Delete error' });
    });
  });
});
