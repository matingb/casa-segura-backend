import { Request, Response } from 'express';
import { PedidoReposicionService } from '../services/pedido-reposicion.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';

const service = new PedidoReposicionService();

export class PedidoReposicionController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      if (req.query.limit === undefined) {
        const data = await service.getAll(tenantId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const limit = normalizePaginationLimit(req.query.limit);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const result = await service.getPaginated(tenantId, limit, offset);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in PedidoReposicionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
