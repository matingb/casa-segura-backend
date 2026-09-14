import { Request, Response } from 'express';
import { TipoService } from '../services/tipo.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';
import { TypedRequestParams } from '../types/request.types';

const service = new TipoService();

export class TipoController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in TipoController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { nombre } = req.body;
      if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
        res.status(400).json(errorResponse('El campo "nombre" es requerido'));
        return;
      }
      const data = await service.create(tenantId, nombre.trim());
      res.status(201).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in TipoController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  delete = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const data = await service.delete(tenantId, id);
      if (!data) {
        res.status(404).json(errorResponse('Tipo no encontrado'));
        return;
      }
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in TipoController.delete:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
