import { Request, Response } from 'express';
import { CotizacionService } from '../services/cotizacion.service';
import { CatalogoError } from '../utils/errors';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';

const service = new CotizacionService();
export class CotizacionController {
  obtener = async (req: Request, res: Response) => {
    try { res.json(successResponse(await service.obtener(await getTenantIdByAuthId(req.user!.id), req.user!.id))); }
    catch (error) { this.error(error, res); }
  };
  actualizar = async (req: Request, res: Response) => {
    try {
      res.json(successResponse(await service.actualizar(await getTenantIdByAuthId(req.user!.id), req.user!.id,
        req.body.cotizacion_usd_ars, req.body.version_esperada)));
    } catch (error) { this.error(error, res); }
  };
  private error(error: unknown, res: Response) {
    if (error instanceof CatalogoError) res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
    else { console.error('[CotizacionController]', error); res.status(500).json(errorResponse('No se pudo cargar la cotización.')); }
  }
}
