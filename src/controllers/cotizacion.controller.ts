import { Request, Response } from 'express';
import { CotizacionService } from '../services/cotizacion.service';
import { CatalogoError } from '../utils/errors';
import { errorResponse, successResponse } from '../utils/response';
import { resolverSucursalAlcance } from '../services/sucursal-alcance.service';

const service = new CotizacionService();
export class CotizacionController {
  obtener = async (req: Request, res: Response) => {
    try {
      const sucursalId = typeof req.query.sucursal_id === 'string' ? req.query.sucursal_id : undefined;
      const alcance = await resolverSucursalAlcance(req.user!.id);
      res.json(successResponse(await service.obtener(alcance.tenantId, req.user!.id, sucursalId, alcance)));
    }
    catch (error) { this.error(error, res); }
  };
  actualizar = async (req: Request, res: Response) => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      res.json(successResponse(await service.actualizar(alcance.tenantId, req.user!.id,
        req.body.cotizacion_usd_ars, req.body.version_esperada, alcance)));
    } catch (error) { this.error(error, res); }
  };
  private error(error: unknown, res: Response) {
    if (error instanceof CatalogoError) res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
    else { console.error('[CotizacionController]', error); res.status(500).json(errorResponse('No se pudo cargar la cotización.')); }
  }
}
