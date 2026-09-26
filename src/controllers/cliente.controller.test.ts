import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { ClienteController } from './cliente.controller';
import { ClienteService } from '../services/cliente.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { BusinessError } from '../utils/errors';

vi.mock('../services/cliente.service');
vi.mock('../utils/tenant');
vi.mock('../utils/response', () => ({
  errorResponse: vi.fn((msg) => ({ error: msg })),
  successResponse: vi.fn((data) => ({ data })),
  paginatedResponse: vi.fn((items, hasMore) => ({ status: 'success', data: items, page: { hasMore } })),
}));

describe('ClienteController', () => {
  let controller: ClienteController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new ClienteController();
    req = {
      user: { id: AUTH_ID } as any,
      params: {},
      body: {},
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  describe('getAllClientes', () => {
    it('sin ?limit: debería retornar 200 y la lista completa de clientes del tenant', async () => {
      const mockClientes = [{ id: '1', nombre: 'Juan Pérez' }];
      vi.mocked(ClienteService.prototype.getAllClientes).mockResolvedValue(mockClientes as any);

      await controller.getAllClientes(req, res as Response);

      expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(ClienteService.prototype.getAllClientes).toHaveBeenCalledWith(TENANT_ID, false);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockClientes));
    });

    it('con ?operativo=true: debería pedir solo los clientes activos', async () => {
      req.query = { operativo: 'true' };
      vi.mocked(ClienteService.prototype.getAllClientes).mockResolvedValue([] as any);

      await controller.getAllClientes(req, res as Response);

      expect(ClienteService.prototype.getAllClientes).toHaveBeenCalledWith(TENANT_ID, true);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('con ?limit y ?offset: debería retornar 200 con datos paginados y page.hasMore', async () => {
      req.query = { limit: '2', offset: '0' };
      const mockItems = [{ id: '1' }, { id: '2' }];
      vi.mocked(ClienteService.prototype.getPaginated).mockResolvedValue({ items: mockItems as any, hasMore: true });

      await controller.getAllClientes(req, res as Response);

      expect(ClienteService.prototype.getPaginated).toHaveBeenCalledWith(TENANT_ID, 2, 0, undefined);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockItems, page: { hasMore: true } });
    });

    it('con ?page: debería retornar total y totalPages calculados', async () => {
      req.query = { page: '2', limit: '10' };
      const mockItems = [{ id: '1' }];
      vi.mocked(ClienteService.prototype.getPaginatedWithTotal).mockResolvedValue({ items: mockItems as any, total: 25 });

      await controller.getAllClientes(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockItems,
        page: { page: 2, limit: 10, total: 25, totalPages: 3 },
      });
    });

    it('con ?page y filtros: debería mapear los filtro_* al objeto de filtros', async () => {
      req.query = {
        page: '1',
        limit: '10',
        search: 'perez',
        filtro_tipoCliente: 'empresa',
        filtro_condicionIva: 'Responsable Inscripto',
        filtro_provincia: 'Buenos Aires',
        filtro_sucursal: 'Central',
        filtro_estado: 'Activo',
        sortBy: 'nombre',
        sortDir: 'desc',
      };
      vi.mocked(ClienteService.prototype.getPaginatedWithTotal).mockResolvedValue({ items: [], total: 0 });

      await controller.getAllClientes(req, res as Response);

      expect(ClienteService.prototype.getPaginatedWithTotal).toHaveBeenCalledWith(
        TENANT_ID,
        10,
        0,
        'perez',
        {
          nombre: undefined,
          tipoCliente: 'empresa',
          condicionIva: 'Responsable Inscripto',
          provincia: 'Buenos Aires',
          sucursal: 'Central',
          estado: 'Activo',
        },
        'nombre',
        'desc'
      );
    });

    it('si el service falla: debería retornar 500', async () => {
      vi.mocked(ClienteService.prototype.getAllClientes).mockRejectedValue(new Error('DB caída'));

      await controller.getAllClientes(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(errorResponse('DB caída'));
    });
  });

  describe('getValoresUnicos', () => {
    it('sin ?campo: debería retornar 400', async () => {
      await controller.getValoresUnicos(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ClienteService.prototype.getValoresUnicos).not.toHaveBeenCalled();
    });

    it('con ?campo: debería retornar 200 y los valores', async () => {
      req.query = { campo: 'provincia' };
      vi.mocked(ClienteService.prototype.getValoresUnicos).mockResolvedValue(['Buenos Aires', 'Córdoba']);

      await controller.getValoresUnicos(req, res as Response);

      expect(ClienteService.prototype.getValoresUnicos).toHaveBeenCalledWith(TENANT_ID, 'provincia');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(['Buenos Aires', 'Córdoba']));
    });
  });

  describe('getCliente', () => {
    it('si existe: debería retornar 200 con el cliente', async () => {
      req.params = { id: 'cli-1' };
      const mockCliente = { id: 'cli-1', nombre: 'Juan Pérez' };
      vi.mocked(ClienteService.prototype.getCliente).mockResolvedValue(mockCliente as any);

      await controller.getCliente(req, res as Response);

      expect(ClienteService.prototype.getCliente).toHaveBeenCalledWith('cli-1', TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockCliente));
    });

    it('si no existe: debería retornar 404', async () => {
      req.params = { id: 'inexistente' };
      vi.mocked(ClienteService.prototype.getCliente).mockResolvedValue(null);

      await controller.getCliente(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(errorResponse('Cliente no encontrado'));
    });
  });

  describe('createCliente', () => {
    it('debería retornar 201 con el cliente creado', async () => {
      req.body = { nombre: 'Juan Pérez' };
      const mockCliente = { id: 'cli-1', nombre: 'Juan Pérez' };
      vi.mocked(ClienteService.prototype.createCliente).mockResolvedValue(mockCliente as any);

      await controller.createCliente(req, res as Response);

      expect(ClienteService.prototype.createCliente).toHaveBeenCalledWith(req.body, TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockCliente));
    });

    it('ante un BusinessError: debería retornar 400 con el mensaje de la regla', async () => {
      req.body = { nombre: '  ' };
      vi.mocked(ClienteService.prototype.createCliente).mockRejectedValue(
        new BusinessError('El nombre del cliente es obligatorio.')
      );

      await controller.createCliente(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(errorResponse('El nombre del cliente es obligatorio.'));
    });
  });

  describe('updateCliente', () => {
    it('si existe: debería retornar 200 con el cliente actualizado', async () => {
      req.params = { id: 'cli-1' };
      req.body = { telefono: '1155667788' };
      const mockCliente = { id: 'cli-1', telefono: '1155667788' };
      vi.mocked(ClienteService.prototype.updateCliente).mockResolvedValue(mockCliente as any);

      await controller.updateCliente(req, res as Response);

      expect(ClienteService.prototype.updateCliente).toHaveBeenCalledWith('cli-1', req.body, TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('si no existe: debería retornar 404', async () => {
      req.params = { id: 'inexistente' };
      vi.mocked(ClienteService.prototype.updateCliente).mockResolvedValue(null);

      await controller.updateCliente(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('ante un BusinessError: debería retornar 400', async () => {
      req.params = { id: 'cli-1' };
      req.body = { descuento_porcentaje: 150 };
      vi.mocked(ClienteService.prototype.updateCliente).mockRejectedValue(
        new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.')
      );

      await controller.updateCliente(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('deleteCliente', () => {
    it('debería desactivar el cliente y retornar 200', async () => {
      req.params = { id: 'cli-1' };
      const mockCliente = { id: 'cli-1', activo: false };
      vi.mocked(ClienteService.prototype.desactivarCliente).mockResolvedValue(mockCliente as any);

      await controller.deleteCliente(req, res as Response);

      expect(ClienteService.prototype.desactivarCliente).toHaveBeenCalledWith('cli-1', TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockCliente));
    });

    it('si no existe: debería retornar 404', async () => {
      req.params = { id: 'inexistente' };
      vi.mocked(ClienteService.prototype.desactivarCliente).mockResolvedValue(null);

      await controller.deleteCliente(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
