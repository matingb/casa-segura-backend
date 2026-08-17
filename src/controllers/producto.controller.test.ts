import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { ProductoController } from './producto.controller';
import { ProductoService } from '../services/producto.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';

vi.mock('../services/producto.service');
vi.mock('../utils/tenant');
vi.mock('../utils/response', () => ({
  errorResponse: vi.fn((msg) => ({ error: msg })),
  successResponse: vi.fn((data) => ({ data })),
  paginatedResponse: vi.fn((items, hasMore) => ({ status: 'success', data: items, page: { hasMore } })),
}));

describe('ProductoController', () => {
  let controller: ProductoController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new ProductoController();
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

  describe('getAllProductos', () => {
    it('sin ?limit: debería retornar 200 y la lista completa de productos del tenant', async () => {
      const mockProductos = [{ id: '1', nombre: 'Prod 1' }];
      vi.mocked(ProductoService.prototype.getAllProductos).mockResolvedValue(mockProductos as any);

      await controller.getAllProductos(req, res as Response);

      expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(ProductoService.prototype.getAllProductos).toHaveBeenCalledWith(TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockProductos));
    });

    it('con ?limit y ?offset: debería retornar 200 con datos paginados y page.hasMore', async () => {
      req.query = { limit: '2', offset: '0' };
      const mockItems = [{ id: '1', nombre: 'Prod 1' }, { id: '2', nombre: 'Prod 2' }];
      vi.mocked(ProductoService.prototype.getPaginated).mockResolvedValue({ items: mockItems as any, hasMore: true });

      await controller.getAllProductos(req, res as Response);

      expect(ProductoService.prototype.getPaginated).toHaveBeenCalledWith(TENANT_ID, 2, 0, undefined);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockItems, page: { hasMore: true } });
    });

    it('con ?search: debería pasar el texto de búsqueda al service', async () => {
      req.query = { limit: '5', offset: '0', search: 'camara' };
      const mockItems = [{ id: '1', nombre: 'Cámara Dahua' }];
      vi.mocked(ProductoService.prototype.getPaginated).mockResolvedValue({ items: mockItems as any, hasMore: false });

      await controller.getAllProductos(req, res as Response);

      expect(ProductoService.prototype.getPaginated).toHaveBeenCalledWith(TENANT_ID, 5, 0, 'camara');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getProducto', () => {
    it('debería retornar 200 y el producto si existe', async () => {
      req.params = { id: 'prod-1' };
      const mockProducto = { id: 'prod-1', nombre: 'Prod 1' };
      vi.mocked(ProductoService.prototype.getProducto).mockResolvedValue(mockProducto as any);

      await controller.getProducto(req, res as Response);

      expect(ProductoService.prototype.getProducto).toHaveBeenCalledWith('prod-1', TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockProducto));
    });

    it('debería retornar 404 si el producto no existe o es de otro tenant', async () => {
      req.params = { id: 'prod-1' };
      vi.mocked(ProductoService.prototype.getProducto).mockResolvedValue(null);

      await controller.getProducto(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(errorResponse('Producto no encontrado'));
    });
  });

  describe('createProducto', () => {
    it('debería crear el producto y retornar 201', async () => {
      req.body = { nombre: 'Nuevo Prod' };
      const mockProducto = { id: 'prod-1', ...req.body, tenant_id: TENANT_ID };
      vi.mocked(ProductoService.prototype.createProducto).mockResolvedValue(mockProducto as any);

      await controller.createProducto(req, res as Response);

      expect(ProductoService.prototype.createProducto).toHaveBeenCalledWith(req.body, TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockProducto));
    });
  });

  describe('updateProducto', () => {
    it('debería actualizar el producto y retornar 200 si pertenece al tenant', async () => {
      req.params = { id: 'prod-1' };
      req.body = { nombre: 'Update' };
      const mockProducto = { id: 'prod-1', ...req.body, tenant_id: TENANT_ID };
      vi.mocked(ProductoService.prototype.updateProducto).mockResolvedValue(mockProducto as any);

      await controller.updateProducto(req, res as Response);

      expect(ProductoService.prototype.updateProducto).toHaveBeenCalledWith('prod-1', req.body, TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse(mockProducto));
    });

    it('debería retornar 404 si el producto a actualizar no existe o es de otro tenant', async () => {
      req.params = { id: 'prod-1' };
      vi.mocked(ProductoService.prototype.updateProducto).mockResolvedValue(null);

      await controller.updateProducto(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(errorResponse('Producto no encontrado'));
    });
  });

  describe('uploadImage', () => {
    it('debería retornar 400 si no se envía ningún archivo', async () => {
      req.params = { id: 'prod-1' };

      await controller.uploadImage(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(errorResponse('No se recibió ninguna imagen'));
      expect(ProductoService.prototype.uploadImage).not.toHaveBeenCalled();
    });

    it('debería retornar 404 si el producto no existe en el tenant', async () => {
      req.params = { id: 'prod-1' };
      req.file = { buffer: Buffer.from('test'), mimetype: 'image/png' } as any;
      
      vi.mocked(ProductoService.prototype.uploadImage).mockResolvedValue(null as any);

      await controller.uploadImage(req, res as Response);

      expect(ProductoService.prototype.uploadImage).toHaveBeenCalledWith('prod-1', TENANT_ID, req.file!.buffer, req.file!.mimetype);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(errorResponse('Producto no encontrado'));
    });

    it('debería subir la imagen, actualizar y retornar 200 con la URL', async () => {
      req.params = { id: 'prod-1' };
      req.file = { buffer: Buffer.from('test'), mimetype: 'image/png' } as any;
      const fakeUrl = 'http://supabase.com/image.png';
      
      vi.mocked(ProductoService.prototype.uploadImage).mockResolvedValue(fakeUrl);

      await controller.uploadImage(req, res as Response);

      expect(ProductoService.prototype.uploadImage).toHaveBeenCalledWith('prod-1', TENANT_ID, req.file!.buffer, req.file!.mimetype);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(successResponse({ imagen_url: fakeUrl }));
    });
  });
});
