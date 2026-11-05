import { Response } from 'express';
import { ProductoSucursalService } from '../services/producto-sucursal.service';
import { ProductoSucursalData, ProductoSucursalFiltros } from '../repositories/producto-sucursal.repository';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { BusinessError, CatalogoError } from '../utils/errors';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';
import { exigirSucursal, recursoNoDisponible, resolverSucursalAlcance } from '../services/sucursal-alcance.service';

const service = new ProductoSucursalService();

export interface ProductoSucursalQuery {
  limit?: string;
  offset?: string;
  sucursalId?: string;
  search?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_codigo?: string;
  filtro_nombre?: string;
  filtro_marca?: string;
  filtro_modelo?: string;
  filtro_subtipo?: string;
  filtro_sucursal?: string;
  filtro_estado?: string;
  operativo?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export class ProductoSucursalController {
  getAll = async (req: TypedRequestQuery<ProductoSucursalQuery>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const tenantId = alcance.tenantId;
      const {
        limit, offset, sucursalId, search, page, sortBy, sortDir,
        filtro_codigo, filtro_nombre, filtro_marca, filtro_modelo, filtro_subtipo, filtro_sucursal, filtro_estado, operativo,
      } = req.query;

      if (sucursalId) exigirSucursal(alcance, sucursalId);

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: ProductoSucursalFiltros = {
          codigo: filtro_codigo,
          nombre: filtro_nombre,
          marca: filtro_marca,
          modelo: filtro_modelo,
          subtipo: filtro_subtipo,
          sucursal: filtro_sucursal,
          estado: filtro_estado,
        };
        const result = await service.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, search, sucursalId, filtros, sortBy, sortDir, operativo === 'true', alcance
        );
        res.status(200).json({
          status: 'success',
          data: result.items,
          page: {
            page: parsedPage,
            limit: normalizedLimit,
            total: result.total,
            totalPages: Math.max(1, Math.ceil(result.total / normalizedLimit)),
          },
        });
        return;
      }

      if (limit === undefined) {
        const data = await service.getAll(tenantId, operativo === 'true', alcance, sucursalId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset, search, sucursalId, operativo === 'true', alcance);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      if (error instanceof CatalogoError) {
        res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  delete = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const item = await service.eliminar(req.params.id, alcance.tenantId, alcance);
      if (!item) {
        res.status(404).json({ ...errorResponse('El recurso no está disponible.'), code: 'RECURSO_NO_DISPONIBLE' });
        return;
      }
      res.status(200).json(successResponse(item));
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
      console.error('Error in ProductoSucursalController.delete:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getValoresUnicos = async (req: TypedRequestQuery<ValoresUnicosQuery>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const { campo } = req.query;
      if (!campo) {
        res.status(400).json(errorResponse('El parámetro "campo" es requerido'));
        return;
      }
      const valores = await service.getValoresUnicos(alcance.tenantId, campo, alcance);
      res.status(200).json(successResponse(valores));
    } catch (error: unknown) {
      if (error instanceof CatalogoError) {
        res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const item = await service.getById(req.params.id, alcance.tenantId, alcance);
      if (!item) {
        throw recursoNoDisponible();
      }
      res.status(200).json(successResponse(item));
    } catch (error: unknown) {
      if (error instanceof CatalogoError) {
        res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in ProductoSucursalController.getById:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: TypedRequestBody<ProductoSucursalData>, res: Response): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const item = await service.create(alcance.tenantId, req.body, alcance);
      res.status(201).json(successResponse(item));
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
      console.error('Error in ProductoSucursalController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  update = async (
    req: TypedRequest<unknown, Partial<ProductoSucursalData>, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const alcance = await resolverSucursalAlcance(req.user!.id);
      const item = await service.update(req.params.id, req.body, alcance.tenantId, alcance);
      if (!item) {
        throw recursoNoDisponible();
      }
      res.status(200).json(successResponse(item));
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
      console.error('Error in ProductoSucursalController.update:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
