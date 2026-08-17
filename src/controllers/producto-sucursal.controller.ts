import { Response } from 'express';
import { ProductoSucursalService } from '../services/producto-sucursal.service';
import { ProductoSucursalData } from '../repositories/producto-sucursal.repository';
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
}

export class ProductoSucursalController {
  getAll = async (req: TypedRequestQuery<ProductoSucursalQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { limit, offset, sucursalId, search } = req.query;

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
