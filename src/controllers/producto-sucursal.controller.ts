import { Response } from 'express';
import { ProductoSucursalService } from '../services/producto-sucursal.service';
import { ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';

const service = new ProductoSucursalService();

export interface ProductoSucursalQuery {
  limit?: string;
  offset?: string;
  sucursalId?: string;
  search?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_codigo?: string;
  filtro_nombre?: string;
  filtro_marca?: string;
  filtro_modelo?: string;
  filtro_subtipo?: string;
  filtro_sucursal?: string;
  filtro_estado?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export class ProductoSucursalController {
  getAll = async (req: TypedRequestQuery<ProductoSucursalQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const {
        limit, offset, sucursalId, search, page, sortBy, sortDir,
        filtro_codigo, filtro_nombre, filtro_marca, filtro_modelo, filtro_subtipo, filtro_sucursal, filtro_estado,
      } = req.query;

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: ProductoSucursalFiltros = {
          codigo: filtro_codigo,
          nombre: filtro_nombre,
          marca: filtro_marca,
          modelo: filtro_modelo,
          subtipo: filtro_subtipo,
          sucursal: filtro_sucursal,
          estado: filtro_estado,
        };
        const result = await service.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, search, sucursalId, filtros, sortBy, sortDir
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
        const data = await service.getAll(tenantId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset, search, sucursalId);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getAll:', error);
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
      const valores = await service.getValoresUnicos(tenantId, campo);
      res.status(200).json(successResponse(valores));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const item = await service.getById(req.params.id, tenantId);
      if (!item) {
        res.status(404).json(errorResponse('Stock no encontrado'));
        return;
      }
      res.status(200).json(successResponse(item));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getById:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: TypedRequestBody<ProductoSucursalData>, res: Response): Promise<void> => {
    try {
      const item = await service.create(req.body);
      res.status(201).json(successResponse(item));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  update = async (
    req: TypedRequest<unknown, Partial<ProductoSucursalData>, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);

      // Corrección manual de stock: deben ser enteros no negativos.
      for (const campo of ['cantidad_disponible', 'cantidad_reservada'] as const) {
        const valor = req.body[campo];
        if (valor === undefined) continue;
        if (!Number.isInteger(valor) || valor < 0) {
          res.status(400).json(errorResponse(`El campo "${campo}" debe ser un número entero mayor o igual a 0`));
          return;
        }
      }

      const item = await service.update(req.params.id, req.body, tenantId);
      if (!item) {
        res.status(404).json(errorResponse('Stock no encontrado'));
        return;
      }
      res.status(200).json(successResponse(item));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.update:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
