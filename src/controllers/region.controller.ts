import { Response } from 'express';
import { RegionService } from '../services/region.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestBody, TypedRequestParams } from '../types/request.types';
import { BusinessError } from '../utils/errors';

const service = new RegionService();

function manejarError(error: unknown, res: Response, contexto: string) {
  if (error instanceof BusinessError) {
    res.status(400).json(errorResponse(error.message));
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error(`[RegionController] ${contexto}:`, error);
  res.status(500).json(errorResponse(message));
}

export class RegionController {
  getRegionesPorSucursal = async (
    req: TypedRequest<{ solo_activas?: string }, unknown, { sucursalId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursalId } = req.params;
      const soloActivas = req.query.solo_activas === 'true';

      const regiones = await service.getRegionesPorSucursal(sucursalId, tenantId, soloActivas);
      res.status(200).json(successResponse(regiones));
    } catch (error: unknown) {
      manejarError(error, res, 'getRegionesPorSucursal');
    }
  };

  getRegion = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const region = await service.getRegion(req.params.id, tenantId);
      res.status(200).json(successResponse(region));
    } catch (error: unknown) {
      manejarError(error, res, 'getRegion');
    }
  };

  createRegion = async (
    req: TypedRequestBody<{ sucursal_id: string; nombre: string; descuento?: number; activo?: boolean }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const nueva = await service.crearRegion(tenantId, req.body);
      res.status(201).json(successResponse(nueva));
    } catch (error: unknown) {
      manejarError(error, res, 'createRegion');
    }
  };

  updateRegion = async (
    req: TypedRequest<unknown, { nombre?: string; descuento?: number; activo?: boolean }, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const actualizada = await service.actualizarRegion(req.params.id, tenantId, req.body);
      if (!actualizada) {
        res.status(404).json(errorResponse('Región no encontrada.'));
        return;
      }
      res.status(200).json(successResponse(actualizada));
    } catch (error: unknown) {
      manejarError(error, res, 'updateRegion');
    }
  };

  deleteRegion = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const eliminada = await service.eliminarRegion(req.params.id, tenantId);
      if (!eliminada) {
        res.status(404).json(errorResponse('Región no encontrada.'));
        return;
      }
      res.status(200).json(successResponse(eliminada));
    } catch (error: unknown) {
      manejarError(error, res, 'deleteRegion');
    }
  };
}
