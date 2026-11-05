import { Response } from 'express';
import { RegionService } from '../services/region.service';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestBody, TypedRequestParams } from '../types/request.types';
import { BusinessError, CatalogoError } from '../utils/errors';
import { resolverSucursalAlcance } from '../services/sucursal-alcance.service';

const service = new RegionService();

function manejarError(error: unknown, res: Response, contexto: string) {
  if (error instanceof CatalogoError) {
    res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
    return;
  }
  if (error instanceof BusinessError) {
    res.status(400).json(errorResponse(error.message));
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error(`[RegionController] ${contexto}:`, error);
  res.status(500).json(errorResponse(message));
}

type RegionBody = { nombre?: string; descuento?: number; activo?: boolean; sucursal_ids?: string[] };

export class RegionController {
  getRegiones = async (req: TypedRequest<{ solo_activas?: string }, unknown, unknown>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const regiones = await service.getRegiones(alcance.tenantId, req.query.solo_activas === 'true', alcance);
      res.status(200).json(successResponse(regiones));
    } catch (error: unknown) {
      manejarError(error, res, 'getRegiones');
    }
  };

  getRegionesPorSucursal = async (
    req: TypedRequest<{ solo_activas?: string }, unknown, { sucursalId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const { sucursalId } = req.params;
      const soloActivas = req.query.solo_activas === 'true';

      const regiones = await service.getRegionesPorSucursal(sucursalId, alcance.tenantId, soloActivas, alcance);
      res.status(200).json(successResponse(regiones));
    } catch (error: unknown) {
      manejarError(error, res, 'getRegionesPorSucursal');
    }
  };

  getRegion = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const region = await service.getRegion(req.params.id, alcance.tenantId, alcance);
      res.status(200).json(successResponse(region));
    } catch (error: unknown) {
      manejarError(error, res, 'getRegion');
    }
  };

  createRegion = async (
    req: TypedRequestBody<RegionBody>,
    res: Response
  ): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const nueva = await service.crearRegion(alcance.tenantId, req.body, alcance);
      res.status(201).json(successResponse(nueva));
    } catch (error: unknown) {
      manejarError(error, res, 'createRegion');
    }
  };

  updateRegion = async (
    req: TypedRequest<unknown, RegionBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const actualizada = await service.actualizarRegion(req.params.id, alcance.tenantId, req.body, alcance);
      if (!actualizada) {
        throw new CatalogoError('El recurso no está disponible.', 'RECURSO_NO_DISPONIBLE', 404);
      }
      res.status(200).json(successResponse(actualizada));
    } catch (error: unknown) {
      manejarError(error, res, 'updateRegion');
    }
  };

  deleteRegion = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const eliminada = await service.eliminarRegion(req.params.id, alcance.tenantId, alcance);
      if (!eliminada) {
        throw new CatalogoError('El recurso no está disponible.', 'RECURSO_NO_DISPONIBLE', 404);
      }
      res.status(200).json(successResponse(eliminada));
    } catch (error: unknown) {
      manejarError(error, res, 'deleteRegion');
    }
  };
}
