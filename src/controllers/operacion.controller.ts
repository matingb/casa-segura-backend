import { Response } from 'express';
import { OperacionService } from '../services/operacion.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequestQuery } from '../types/request.types';

const service = new OperacionService();

export interface OperacionesQuery {
  limit?: string;
  offset?: string;
  sucursalId?: string;
  tipoId?: string;
}

export class OperacionController {
  getAll = async (req: TypedRequestQuery<OperacionesQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { limit, offset, sucursalId, tipoId } = req.query;

      if (limit === undefined) {
        const data = await service.getAll(tenantId, sucursalId, tipoId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset, sucursalId, tipoId);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in OperacionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
