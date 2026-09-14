import { Request, Response } from 'express';
import { SubtipoService } from '../services/subtipo.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';
import { TypedRequestParams } from '../types/request.types';

const service = new SubtipoService();

export class SubtipoController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in SubtipoController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const tipoId = req.body.tipo_id ?? req.body.tipoId;
      const { nombre } = req.body;

      if (!tipoId || typeof tipoId !== 'string') {
        res.status(400).json(errorResponse('El campo "tipo_id" es requerido'));
        return;
      }
      if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
        res.status(400).json(errorResponse('El campo "nombre" es requerido'));
        return;
      }

      const data = await service.create(tenantId, tipoId, nombre.trim());
      if (!data) {
        res.status(404).json(errorResponse('Tipo no encontrado o no pertenece al tenant'));
        return;
      }
      res.status(201).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in SubtipoController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  delete = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const data = await service.delete(tenantId, id);
      if (!data) {
        res.status(404).json(errorResponse('Subtipo no encontrado'));
        return;
      }
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in SubtipoController.delete:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
