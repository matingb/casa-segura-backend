import { Response } from 'express';
import { OperacionService } from '../services/operacion.service';
import { OperacionFiltros } from '../repositories/operacion.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { BusinessError } from '../utils/errors';
import { TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';

const service = new OperacionService();

export interface OperacionesQuery {
  limit?: string;
  offset?: string;
  sucursalId?: string;
  tipoId?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_sucursal?: string;
  filtro_usuario?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

const TIPOS_VALIDOS = ['compra', 'venta', 'traslado', 'movimiento'];

export interface OperacionCrearBody {
  tipo?: string;
  sucursal_id?: string;
  fecha?: string;
  modo_reparto?: 'porcentaje' | 'monto';
  items?: Array<{ producto_sucursal_id?: string; cantidad?: number; [key: string]: unknown }>;
  cuentas?: Array<{
    cuenta_financiera_id?: string;
    porcentaje_venta?: number;
    monto_ars?: number;
    [key: string]: unknown;
  }>;
  compra?: { proveedor_id?: string; [key: string]: unknown };
  venta?: Record<string, unknown>;
  traslado?: { sucursal_destino_id?: string; [key: string]: unknown };
  movimiento?: { tipo?: string; monto_ars?: number; [key: string]: unknown };
}

export class OperacionController {
  getAll = async (req: TypedRequestQuery<OperacionesQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { limit, offset, sucursalId, tipoId, page, sortBy, sortDir, filtro_sucursal, filtro_usuario } = req.query;

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: OperacionFiltros = {
          sucursal: filtro_sucursal,
          usuario: filtro_usuario,
        };
        const result = await service.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, sucursalId, tipoId, filtros, sortBy, sortDir
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
        const data = await service.getAll(tenantId, sucursalId, tipoId);
        res.status(200).json({ status: 'success', data });
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await service.getPaginated(tenantId, normalizedLimit, parsedOffset, sucursalId, tipoId);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in OperacionController.getAll:', error);
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
      console.error('Error in OperacionController.getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const data = await service.getById(tenantId, id);
      if (!data) {
        res.status(404).json(errorResponse('Operación no encontrada'));
        return;
      }
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in OperacionController.getById:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: TypedRequestBody<OperacionCrearBody>, res: Response): Promise<void> => {
    try {
      const authId = req.user!.id;
      const tenantId = await getTenantIdByAuthId(authId);
      const body = req.body;

      if (!body.tipo || !TIPOS_VALIDOS.includes(body.tipo)) {
        res.status(400).json(errorResponse('El campo "tipo" es requerido y debe ser compra, venta, traslado o movimiento'));
        return;
      }
      if (!body.sucursal_id) {
        res.status(400).json(errorResponse('El campo "sucursal_id" es requerido'));
        return;
      }

      if (body.tipo === 'compra' || body.tipo === 'venta' || body.tipo === 'traslado') {
        if (!body.items || body.items.length === 0) {
          res.status(400).json(errorResponse('El campo "items" es requerido y no puede estar vacío'));
          return;
        }
        for (const item of body.items) {
          if (!item.producto_sucursal_id || !item.cantidad || item.cantidad <= 0) {
            res.status(400).json(errorResponse('Cada item requiere "producto_sucursal_id" y "cantidad" mayor a 0'));
            return;
          }
        }
      }

      if (body.tipo === 'compra') {
        if (!body.compra?.proveedor_id) {
          res.status(400).json(errorResponse('El campo "compra.proveedor_id" es requerido'));
          return;
        }
      }

      if (body.tipo === 'traslado') {
        if (!body.traslado?.sucursal_destino_id) {
          res.status(400).json(errorResponse('El campo "traslado.sucursal_destino_id" es requerido'));
          return;
        }
        if (body.traslado.sucursal_destino_id === body.sucursal_id) {
          res.status(400).json(errorResponse('La sucursal destino no puede ser igual a la sucursal de origen'));
          return;
        }
      }

      if (body.tipo === 'movimiento') {
        if (body.movimiento?.tipo !== 'ingreso' && body.movimiento?.tipo !== 'egreso') {
          res.status(400).json(errorResponse('El campo "movimiento.tipo" debe ser "ingreso" o "egreso"'));
          return;
        }
        // El monto del movimiento se deriva de las cuentas, no se recibe suelto.
        if (!body.cuentas || body.cuentas.length === 0) {
          res.status(400).json(errorResponse('El campo "cuentas" es requerido para movimientos'));
          return;
        }
      }

      // Reparto entre cuentas financieras.
      if (body.modo_reparto !== undefined && body.modo_reparto !== 'porcentaje' && body.modo_reparto !== 'monto') {
        res.status(400).json(errorResponse('El campo "modo_reparto" debe ser "porcentaje" o "monto"'));
        return;
      }
      // Los movimientos siempre reparten por monto: el total surge de las cuentas.
      const modoReparto = body.tipo === 'movimiento' ? 'monto' : body.modo_reparto ?? 'monto';
      for (const cuenta of body.cuentas ?? []) {
        if (!cuenta.cuenta_financiera_id) {
          res.status(400).json(errorResponse('Cada cuenta requiere "cuenta_financiera_id"'));
          return;
        }
        if (modoReparto === 'porcentaje') {
          const porcentaje = Number(cuenta.porcentaje_venta ?? 0);
          if (!(porcentaje > 0)) {
            res.status(400).json(errorResponse('En el reparto por porcentaje, cada cuenta requiere "porcentaje_venta" mayor a 0'));
            return;
          }
        } else {
          const monto = Number(cuenta.monto_ars ?? 0);
          if (!(monto > 0)) {
            res.status(400).json(errorResponse('En el reparto por monto, cada cuenta requiere "monto_ars" mayor a 0'));
            return;
          }
        }
      }

      const data = await service.crear(tenantId, authId, { ...body, modo_reparto: modoReparto } as any);
      res.status(201).json({ status: 'success', data });
    } catch (error: unknown) {
      if (error instanceof BusinessError) {
        res.status(400).json(errorResponse(error.message));
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in OperacionController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}

