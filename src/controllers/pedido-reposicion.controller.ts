import { Response } from 'express';
import { PedidoReposicionService } from '../services/pedido-reposicion.service';
import { PedidoReposicionFiltros } from '../repositories/pedido-reposicion.repository';
import { getTenantIdByAuthId, getUsuarioIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequestBody, TypedRequestQuery } from '../types/request.types';

const service = new PedidoReposicionService();

export interface PedidoReposicionQuery {
  limit?: string;
  offset?: string;
  sucursalId?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_producto?: string;
  filtro_sucursal?: string;
  filtro_proveedor?: string;
  filtro_estado?: string;
  filtro_usuario?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export interface PedidoReposicionCrearBody {
  producto_sucursal_id?: string;
  proveedor_id?: string;
  cantidad?: number;
}

export class PedidoReposicionController {
  getAll = async (req: TypedRequestQuery<PedidoReposicionQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const {
        limit, offset, sucursalId, page, sortBy, sortDir,
        filtro_producto, filtro_sucursal, filtro_proveedor, filtro_estado, filtro_usuario,
      } = req.query;

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: PedidoReposicionFiltros = {
          producto: filtro_producto,
          sucursal: filtro_sucursal,
          proveedor: filtro_proveedor,
          estado: filtro_estado,
          usuario: filtro_usuario,
        };
        const result = await service.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, sucursalId, filtros, sortBy, sortDir
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
        const data = await service.getAll(tenantId, sucursalId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset, sucursalId);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in PedidoReposicionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getValoresUnicos = async (req: TypedRequestQuery<ValoresUnicosQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { campo } = req.query;
      if (!campo) {
        res.status(400).json(errorResponse('El parámetro "campo" es requerido'));
        return;
      }
      const valores = await service.getValoresUnicos(tenantId, campo);
      res.status(200).json(successResponse(valores));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in PedidoReposicionController.getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: TypedRequestBody<PedidoReposicionCrearBody>, res: Response): Promise<void> => {
    try {
      const authId = req.user!.id;
      const tenantId = await getTenantIdByAuthId(authId);
      const { producto_sucursal_id, proveedor_id, cantidad } = req.body;

      if (!producto_sucursal_id) {
        res.status(400).json(errorResponse('El campo "producto_sucursal_id" es requerido'));
        return;
      }
      if (!proveedor_id) {
        res.status(400).json(errorResponse('El campo "proveedor_id" es requerido'));
        return;
      }
      if (!cantidad || cantidad <= 0) {
        res.status(400).json(errorResponse('El campo "cantidad" es requerido y debe ser mayor a 0'));
        return;
      }

      const usuarioId = await getUsuarioIdByAuthId(authId);
      const data = await service.crear(tenantId, usuarioId, { producto_sucursal_id, proveedor_id, cantidad });
      res.status(201).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in PedidoReposicionController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
