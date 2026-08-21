import { Response } from 'express';
import { ProductoService } from '../services/producto.service';
import { ProductoData, ProductoFiltros } from '../repositories/producto.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';

export interface ProductoQuery {
  limit?: string;
  offset?: string;
  search?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_codigo?: string;
  filtro_nombre?: string;
  filtro_marca?: string;
  filtro_modelo?: string;
  filtro_subtipo?: string;
  filtro_estado?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export class ProductoController {
  private productoService: ProductoService;

  constructor() {
    this.productoService = new ProductoService();
  }

  getAllProductos = async (req: TypedRequestQuery<ProductoQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const {
        limit, offset, search, page, sortBy, sortDir,
        filtro_codigo, filtro_nombre, filtro_marca, filtro_modelo, filtro_subtipo, filtro_estado,
      } = req.query;

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: ProductoFiltros = {
          codigo: filtro_codigo,
          nombre: filtro_nombre,
          marca: filtro_marca,
          modelo: filtro_modelo,
          subtipo: filtro_subtipo,
          estado: filtro_estado,
        };
        const result = await this.productoService.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, search, filtros, sortBy, sortDir
        );
        res.status(200).json({
          status: 'success',
          data: result.items,
          page: {
            page: parsedPage,
            limit: normalizedLimit,
            total: result.total,
            totalPages: Math.max(1, Math.ceil(result.total / normalizedLimit)),
          },
        });
        return;
      }

      if (limit === undefined) {
        const productos = await this.productoService.getAllProductos(tenantId);
        res.status(200).json(successResponse(productos));
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await this.productoService.getPaginated(tenantId, normalizedLimit, parsedOffset, search);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] getAllProductos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getValoresUnicos = async (req: TypedRequestQuery<ValoresUnicosQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { campo } = req.query;
      if (!campo) {
        res.status(400).json(errorResponse('El parámetro "campo" es requerido'));
        return;
      }
      const valores = await this.productoService.getValoresUnicos(tenantId, campo);
      res.status(200).json(successResponse(valores));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getProducto = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.getProducto(req.params.id, tenantId);
      if (!producto) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }
      res.status(200).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] getProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  createProducto = async (
    req: TypedRequestBody<Omit<ProductoData, 'tenant_id'>>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.createProducto(req.body, tenantId);
      res.status(201).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] createProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  updateProducto = async (
    req: TypedRequest<unknown, Partial<ProductoData>, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.updateProducto(
        req.params.id,
        req.body,
        tenantId
      );
      if (!producto) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }
      res.status(200).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] updateProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  uploadImage = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const id = req.params.id;

      if (!req.file) {
        res.status(400).json(errorResponse('No se recibió ninguna imagen'));
        return;
      }

      const publicUrl = await this.productoService.uploadImage(
        id,
        tenantId,
        req.file.buffer,
        req.file.mimetype
      );

      if (!publicUrl) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }

      res.status(200).json(successResponse({ imagen_url: publicUrl }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] uploadImage:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
