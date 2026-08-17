import { Request, Response } from 'express';
import { SucursalService } from '../services/sucursal.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';

const service = new SucursalService();

export class SucursalController {
  getAllByUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const authId = req.user!.id;
      const tenantId = await getTenantIdByAuthId(authId);
      const data = await service.getByUser(authId, tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in SucursalController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
