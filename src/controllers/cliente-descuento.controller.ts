import { Response } from 'express';
import { ClienteDescuentoService } from '../services/cliente-descuento.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestBody, TypedRequestParams } from '../types/request.types';
import { BusinessError } from '../utils/errors';

const service = new ClienteDescuentoService();

function manejarError(error: unknown, res: Response, contexto: string) {
  if (error instanceof BusinessError) {
    res.status(400).json(errorResponse(error.message));
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error(`[ClienteDescuentoController] ${contexto}:`, error);
  res.status(500).json(errorResponse(message));
}

export class ClienteDescuentoController {
  getDescuentos = async (
    req: TypedRequestParams<{ id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const resultado = await service.getDescuentosCliente(req.params.id, tenantId);
      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      manejarError(error, res, 'getDescuentos');
    }
  };

  asignarCategoria = async (
    req: TypedRequest<
      unknown,
      { tipo_id?: string; subtipo_id?: string; porcentaje: number; nota?: string },
      { id: string }
    >,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { tipo_id, subtipo_id, porcentaje, nota } = req.body;

      if (!tipo_id && !subtipo_id) {
        res.status(400).json(errorResponse('Debe especificar una categoría o subcategoría.'));
        return;
      }
      if (tipo_id && subtipo_id) {
        res.status(400).json(errorResponse('No puede especificar categoría y subcategoría simultáneamente.'));
        return;
      }

      const destino = tipo_id ? { tipoId: tipo_id } : { subtipoId: subtipo_id! };
      const guardado = await service.asignarDescuentoCategoria(
        req.params.id,
        tenantId,
        destino,
        porcentaje,
        nota
      );
      res.status(200).json(successResponse(guardado));
    } catch (error: unknown) {
      manejarError(error, res, 'asignarCategoria');
    }
  };

  quitarCategoria = async (
    req: TypedRequestParams<{ id: string; descuentoId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const resultado = await service.quitarDescuentoCategoria(
        req.params.id,
        req.params.descuentoId,
        tenantId
      );
      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      manejarError(error, res, 'quitarCategoria');
    }
  };

  asignarProducto = async (
    req: TypedRequest<
      unknown,
      { producto_id: string; porcentaje: number; nota?: string },
      { id: string }
    >,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { producto_id, porcentaje, nota } = req.body;

      if (!producto_id) {
        res.status(400).json(errorResponse('El producto es obligatorio.'));
        return;
      }

      const guardado = await service.asignarDescuentoProducto(
        req.params.id,
        tenantId,
        producto_id,
        porcentaje,
        nota
      );
      res.status(200).json(successResponse(guardado));
    } catch (error: unknown) {
      manejarError(error, res, 'asignarProducto');
    }
  };

  quitarProducto = async (
    req: TypedRequestParams<{ id: string; descuentoId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const resultado = await service.quitarDescuentoProducto(
        req.params.id,
        req.params.descuentoId,
        tenantId
      );
      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      manejarError(error, res, 'quitarProducto');
    }
  };

  asignarRegion = async (
    req: TypedRequest<
      unknown,
      { sucursal_id: string; region_id: string },
      { id: string }
    >,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sucursal_id, region_id } = req.body;

      if (!sucursal_id || !region_id) {
        res.status(400).json(errorResponse('La sucursal y la región son obligatorias.'));
        return;
      }

      const asignado = await service.asignarRegion(
        req.params.id,
        tenantId,
        sucursal_id,
        region_id
      );
      res.status(200).json(successResponse(asignado));
    } catch (error: unknown) {
      manejarError(error, res, 'asignarRegion');
    }
  };

  quitarRegion = async (
    req: TypedRequestParams<{ id: string; sucursalId: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const resultado = await service.quitarRegion(
        req.params.id,
        tenantId,
        req.params.sucursalId
      );
      res.status(200).json(successResponse(resultado));
    } catch (error: unknown) {
      manejarError(error, res, 'quitarRegion');
    }
  };
}
