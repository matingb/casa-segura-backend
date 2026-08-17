import { Request, Response } from 'express';
import { ProductoSucursalService } from '../services/producto-sucursal.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';

const service = new ProductoSucursalService();

export class ProductoSucursalController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const sucursalId = typeof req.query.sucursalId === 'string'
        ? req.query.sucursalId.trim() || undefined
        : typeof req.query.sucursal_id === 'string'
        ? req.query.sucursal_id.trim() || undefined
        : undefined;

      if (req.query.limit === undefined) {
        const data = await service.getAll(tenantId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const limit = normalizePaginationLimit(req.query.limit);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const search = typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined;
      const result = await service.getPaginated(tenantId, limit, offset, search, sucursalId);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const item = await service.getById(req.params.id as string, tenantId);
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

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const item = await service.create(req.body);
      res.status(201).json(successResponse(item));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const item = await service.update(req.params.id as string, req.body, tenantId);
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
