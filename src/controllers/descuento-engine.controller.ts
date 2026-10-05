import { Response } from 'express';
import { DescuentoEngineService, EvaluarItemInput } from '../services/descuento-engine.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequestBody } from '../types/request.types';
import { BusinessError, CatalogoError } from '../utils/errors';
import { ListaPreciosService } from '../services/lista-precios.service';
import { Request } from 'express';

const service = new DescuentoEngineService();

interface EvaluarOperacionBody {
  sucursalId: string;
  clienteId?: string | null;
  items: EvaluarItemInput[];
  cotizacionVersion?: string;
}

export class DescuentoEngineController {
  listaCliente = async (req: Request, res: Response): Promise<void> => {
    try {
      if (typeof req.query.sucursalId !== 'string' || typeof req.query.clienteId !== 'string') {
        throw new CatalogoError('Elegí un cliente y una sucursal.', 'CONTEXTO_INVALIDO');
      }
      res.json(successResponse(await new ListaPreciosService().obtener(
        await getTenantIdByAuthId(req.user!.id), req.query.sucursalId, req.query.clienteId)));
    } catch (error) {
      if (error instanceof CatalogoError) res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
      else { console.error('[ListaPrecios]', error); res.status(500).json(errorResponse('No se pudo generar la lista de precios.')); }
    }
  };
  evaluar = async (
    req: TypedRequestBody<EvaluarOperacionBody>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursalId, clienteId, items, cotizacionVersion } = req.body;

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
        items,
        cotizacionVersion
      );

      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      if (error instanceof CatalogoError) {
        res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
        return;
      }
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
