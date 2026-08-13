import { Request, Response } from 'express';
import { ProductoSucursalService } from '../services/producto-sucursal.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';

const service = new ProductoSucursalService();

export class ProductoSucursalController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
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
