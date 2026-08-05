import { Request, Response } from 'express';
import { SubtipoService } from '../services/subtipo.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';

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
}
