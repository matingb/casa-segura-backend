import { Request, Response } from 'express';
import { OperacionService } from '../services/operacion.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';

const service = new OperacionService();

export class OperacionController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in OperacionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
