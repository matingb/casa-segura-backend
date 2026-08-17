import { Response } from 'express';
import { PedidoReposicionService } from '../services/pedido-reposicion.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequestQuery } from '../types/request.types';

const service = new PedidoReposicionService();

export interface PedidoReposicionQuery {
  limit?: string;
  offset?: string;
}

export class PedidoReposicionController {
  getAll = async (req: TypedRequestQuery<PedidoReposicionQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { limit, offset } = req.query;

      if (limit === undefined) {
        const data = await service.getAll(tenantId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in PedidoReposicionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
