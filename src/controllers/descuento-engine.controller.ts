import { Response } from 'express';
import { DescuentoEngineService, EvaluarItemInput } from '../services/descuento-engine.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequestBody } from '../types/request.types';
import { BusinessError } from '../utils/errors';

const service = new DescuentoEngineService();

interface EvaluarOperacionBody {
  sucursalId: string;
  clienteId?: string | null;
  items: EvaluarItemInput[];
}

export class DescuentoEngineController {
  evaluar = async (
    req: TypedRequestBody<EvaluarOperacionBody>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursalId, clienteId, items } = req.body;

      if (!sucursalId) {
        res.status(400).json(errorResponse('El campo "sucursalId" es obligatorio.'));
        return;
      }
      if (!Array.isArray(items)) {
        res.status(400).json(errorResponse('El campo "items" debe ser una lista.'));
        return;
      }

      const resultado = await service.evaluarOperacion(
        tenantId,
        sucursalId,
        clienteId,
        items
      );

      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      if (error instanceof BusinessError) {
        res.status(400).json(errorResponse(error.message));
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[DescuentoEngineController] evaluar:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
