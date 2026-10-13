import { Response } from 'express';
import { DescuentoCategoriaService } from '../services/descuento-categoria.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestParams } from '../types/request.types';
import { BusinessError } from '../utils/errors';

const service = new DescuentoCategoriaService();

interface DescuentoGeneralBody {
  descuento_general: number | null;
}

interface ExcepcionBody {
  sucursal_id: string;
  porcentaje: number;
}

function manejarError(error: unknown, res: Response, contexto: string) {
  if (error instanceof BusinessError) {
    res.status(400).json(errorResponse(error.message));
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error(`[DescuentoCategoriaController] ${contexto}:`, error);
  res.status(500).json(errorResponse(message));
}

export class DescuentoCategoriaController {
  setDescuentoTipo = async (
    req: TypedRequest<unknown, DescuentoGeneralBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const valor = req.body.descuento_general;
      const tipo = await service.setDescuentoGeneralTipo(
        tenantId,
        req.params.id,
        valor === null || valor === undefined ? null : Number(valor)
      );
      if (!tipo) {
        res.status(404).json(errorResponse('Categoría no encontrada'));
        return;
      }
      res.status(200).json(successResponse(tipo));
    } catch (error: unknown) {
      manejarError(error, res, 'setDescuentoTipo');
    }
  };

  setDescuentoSubtipo = async (
    req: TypedRequest<unknown, DescuentoGeneralBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const valor = req.body.descuento_general;
      const subtipo = await service.setDescuentoGeneralSubtipo(
        tenantId,
        req.params.id,
        valor === null || valor === undefined ? null : Number(valor)
      );
      if (!subtipo) {
        res.status(404).json(errorResponse('Subcategoría no encontrada'));
        return;
      }
      res.status(200).json(successResponse(subtipo));
    } catch (error: unknown) {
      manejarError(error, res, 'setDescuentoSubtipo');
    }
  };

  setExcepcionTipo = async (
    req: TypedRequest<unknown, ExcepcionBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursal_id, porcentaje } = req.body;
      if (!sucursal_id) {
        res.status(400).json(errorResponse('La sucursal es obligatoria.'));
        return;
      }
      const creado = await service.setExcepcion(
        tenantId,
        { tipoId: req.params.id },
        sucursal_id,
        Number(porcentaje)
      );
      if (!creado) {
        res.status(404).json(errorResponse('Categoría no encontrada'));
        return;
      }
      res.status(200).json(successResponse(creado));
    } catch (error: unknown) {
      manejarError(error, res, 'setExcepcionTipo');
    }
  };

  setExcepcionSubtipo = async (
    req: TypedRequest<unknown, ExcepcionBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursal_id, porcentaje } = req.body;
      if (!sucursal_id) {
        res.status(400).json(errorResponse('La sucursal es obligatoria.'));
        return;
      }
      const creado = await service.setExcepcion(
        tenantId,
        { subtipoId: req.params.id },
        sucursal_id,
        Number(porcentaje)
      );
      if (!creado) {
        res.status(404).json(errorResponse('Subcategoría no encontrada'));
        return;
      }
      res.status(200).json(successResponse(creado));
    } catch (error: unknown) {
      manejarError(error, res, 'setExcepcionSubtipo');
    }
  };

  eliminarExcepcion = async (
    req: TypedRequestParams<{ id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const eliminado = await service.eliminarExcepcion(tenantId, req.params.id);
      if (!eliminado) {
        res.status(404).json(errorResponse('Descuento no encontrado'));
        return;
      }
      res.status(200).json(successResponse(eliminado));
    } catch (error: unknown) {
      manejarError(error, res, 'eliminarExcepcion');
    }
  };
}
