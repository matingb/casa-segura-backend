import { Request, Response } from 'express';
import { CuentaFinancieraService } from '../services/cuenta-financiera.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse } from '../utils/response';

const service = new CuentaFinancieraService();

export class CuentaFinancieraController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const data = await service.getAll(tenantId);
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in CuentaFinancieraController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
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

  create = async (req: Request, res: Response): Promise<void> => {
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

  update = async (req: Request, res: Response): Promise<void> => {
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
}
