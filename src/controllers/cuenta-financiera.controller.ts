import { Request, Response } from 'express';
import { CuentaFinancieraService } from '../services/cuenta-financiera.service';
import { CuentaFinancieraFiltros } from '../repositories/cuenta-financiera.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';

const service = new CuentaFinancieraService();

export interface CuentaFinancieraBody {
  nombre?: string;
  saldo_inicial?: number | string;
  porcentaje_extra?: number | string;
}

export interface CuentaFinancieraQuery {
  sortBy?: string;
  sortDir?: string;
  filtro_nombre?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export class CuentaFinancieraController {
  getAll = async (req: TypedRequestQuery<CuentaFinancieraQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { sortBy, sortDir, filtro_nombre } = req.query ?? {};

      if (sortBy || sortDir || filtro_nombre) {
        const filtros: CuentaFinancieraFiltros = { nombre: filtro_nombre };
        const data = await service.getAllFiltradas(tenantId, filtros, sortBy, sortDir);
        res.status(200).json({ status: 'success', data });
        return;
      }

      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.getAll:', error);
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
      console.error('Error in CuentaFinancieraController.getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const data = await service.getById(tenantId, id);
      if (!data) {
        res.status(404).json(errorResponse('Cuenta financiera no encontrada'));
        return;
      }
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.getById:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  create = async (req: TypedRequestBody<CuentaFinancieraBody>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { nombre, saldo_inicial, porcentaje_extra } = req.body;

      if (!nombre) {
        res.status(400).json(errorResponse('El campo "nombre" es requerido'));
        return;
      }

      const data = await service.create(tenantId, {
        nombre,
        saldo_inicial: Number(saldo_inicial ?? 0),
        porcentaje_extra: Number(porcentaje_extra ?? 0),
      });
      res.status(201).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.create:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  update = async (
    req: TypedRequest<unknown, CuentaFinancieraBody, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const { nombre, saldo_inicial, porcentaje_extra } = req.body;

      const data = await service.update(tenantId, id, {
        nombre,
        saldo_inicial: saldo_inicial !== undefined ? Number(saldo_inicial) : undefined,
        porcentaje_extra: porcentaje_extra !== undefined ? Number(porcentaje_extra) : undefined,
      });

      if (!data) {
        res.status(404).json(errorResponse('Cuenta financiera no encontrada'));
        return;
      }
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.update:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getMovimientos = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { id } = req.params;
      const data = await service.getMovimientos(tenantId, id);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.getMovimientos:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}

