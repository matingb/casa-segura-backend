import { Request, Response } from 'express';
import { SucursalService } from '../services/sucursal.service';
import { SucursalData } from '../repositories/sucursal.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';
import { BusinessError } from '../utils/errors';

const service = new SucursalService();

interface SucursalQuery {
  /** `todas=true` incluye las dadas de baja (lo usa el ABM de configuración). */
  todas?: string;
}

function manejarError(error: unknown, res: Response, contexto: string) {
  if (error instanceof BusinessError) {
    res.status(400).json(errorResponse(error.message));
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error(`[SucursalController] ${contexto}:`, error);
  res.status(500).json(errorResponse(message));
}

export class SucursalController {
  getAllByUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const authId = req.user!.id;
      const tenantId = await getTenantIdByAuthId(authId);
      const data = await service.getByUser(authId, tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      manejarError(error, res, 'getAllByUser');
    }
  };

  /** Todas las sucursales del tenant, para administrarlas desde Configuración. */
  getAll = async (req: TypedRequestQuery<SucursalQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId, req.query.todas !== 'true');
      res.status(200).json(successResponse(data));
    } catch (error: unknown) {
      manejarError(error, res, 'getAll');
    }
  };

  create = async (req: TypedRequestBody<SucursalData>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const sucursal = await service.create(tenantId, req.body);
      res.status(201).json(successResponse(sucursal));
    } catch (error: unknown) {
      manejarError(error, res, 'create');
    }
  };

  update = async (
    req: TypedRequest<unknown, Partial<SucursalData>, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const sucursal = await service.update(req.params.id, tenantId, req.body);
      if (!sucursal) {
        res.status(404).json(errorResponse('Sucursal no encontrada'));
        return;
      }
      res.status(200).json(successResponse(sucursal));
    } catch (error: unknown) {
      manejarError(error, res, 'update');
    }
  };

  delete = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const sucursal = await service.desactivar(req.params.id, tenantId);
      if (!sucursal) {
        res.status(404).json(errorResponse('Sucursal no encontrada'));
        return;
      }
      res.status(200).json(successResponse(sucursal));
    } catch (error: unknown) {
      manejarError(error, res, 'delete');
    }
  };

  /** Qué queda inaccesible si se da de baja: se muestra antes de confirmar. */
  getResumenUso = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const resumen = await service.resumenUso(req.params.id, tenantId);
      if (!resumen) {
        res.status(404).json(errorResponse('Sucursal no encontrada'));
        return;
      }
      res.status(200).json(successResponse(resumen));
    } catch (error: unknown) {
      manejarError(error, res, 'getResumenUso');
    }
  };
}
