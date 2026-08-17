import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { CuentaFinancieraController } from './cuenta-financiera.controller';
import { CuentaFinancieraService } from '../services/cuenta-financiera.service';
import { getTenantIdByAuthId } from '../utils/tenant';

vi.mock('../services/cuenta-financiera.service');
vi.mock('../utils/tenant');

describe('CuentaFinancieraController', () => {
  let controller: CuentaFinancieraController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new CuentaFinancieraController();
    req = {
      user: { id: AUTH_ID } as any,
      params: {},
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  describe('getAll', () => {
    it('debería retornar 200 con todas las cuentas del tenant', async () => {
      const mockCuentas = [
        { id: 'c-1', nombre: 'Efectivo', saldo_inicial: 50000, saldo_actual: 50000, porcentaje_extra: 0 },
      ];
      vi.mocked(CuentaFinancieraService.prototype.getAll).mockResolvedValue(mockCuentas as any);

      await controller.getAll(req, res as Response);

      expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
      expect(CuentaFinancieraService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCuentas });
    });

    it('debería responder con 500 ante un error en getAll', async () => {
      vi.mocked(getTenantIdByAuthId).mockRejectedValue(new Error('DB Error'));

      await controller.getAll(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });

  describe('getById', () => {
    it('debería retornar 200 con la cuenta encontrada', async () => {
      const mockCuenta = { id: 'c-1', nombre: 'Efectivo', saldo_inicial: 50000 };
      vi.mocked(CuentaFinancieraService.prototype.getById).mockResolvedValue(mockCuenta as any);
      req.params = { id: 'c-1' };

      await controller.getById(req, res as Response);

      expect(CuentaFinancieraService.prototype.getById).toHaveBeenCalledWith(TENANT_ID, 'c-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCuenta });
    });

    it('debería retornar 404 si la cuenta no existe', async () => {
      vi.mocked(CuentaFinancieraService.prototype.getById).mockResolvedValue(null as any);
      req.params = { id: 'c-999' };

      await controller.getById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Cuenta financiera no encontrada' });
    });
  });

  describe('create', () => {
    it('debería retornar 400 si falta el campo nombre', async () => {
      req.body = { saldo_inicial: 1000 };

      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'El campo "nombre" es requerido' });
    });

    it('debería retornar 201 con la cuenta creada', async () => {
      const mockCreated = { id: 'c-2', nombre: 'Banco', saldo_inicial: 1000, porcentaje_extra: 0 };
      vi.mocked(CuentaFinancieraService.prototype.create).mockResolvedValue(mockCreated as any);
      req.body = { nombre: 'Banco', saldo_inicial: 1000, porcentaje_extra: 0 };

      await controller.create(req, res as Response);

      expect(CuentaFinancieraService.prototype.create).toHaveBeenCalledWith(TENANT_ID, {
        nombre: 'Banco',
        saldo_inicial: 1000,
        porcentaje_extra: 0,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCreated });
    });
  });

  describe('update', () => {
    it('debería retornar 200 con la cuenta actualizada', async () => {
      const mockUpdated = { id: 'c-1', nombre: 'Efectivo Modificado' };
      vi.mocked(CuentaFinancieraService.prototype.update).mockResolvedValue(mockUpdated as any);
      req.params = { id: 'c-1' };
      req.body = { nombre: 'Efectivo Modificado' };

      await controller.update(req, res as Response);

      expect(CuentaFinancieraService.prototype.update).toHaveBeenCalledWith(TENANT_ID, 'c-1', {
        nombre: 'Efectivo Modificado',
        saldo_inicial: undefined,
        porcentaje_extra: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockUpdated });
    });

    it('debería retornar 404 si la cuenta a actualizar no existe', async () => {
      vi.mocked(CuentaFinancieraService.prototype.update).mockResolvedValue(null as any);
      req.params = { id: 'c-999' };
      req.body = { nombre: 'Efectivo' };

      await controller.update(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Cuenta financiera no encontrada' });
    });
  });

  describe('getMovimientos', () => {
    it('debería retornar 200 con la lista de movimientos de la cuenta', async () => {
      const mockMovimientos = [
        {
          id: 'oc-1',
          operacion_id: 'op-1',
          cuenta_financiera_id: 'c-1',
          monto_ars: 123420,
          tipo_nombre: 'Venta',
          fecha: '2026-08-15T12:00:00Z',
          comprobante: 'B-0001-00000234',
        },
      ];
      vi.mocked(CuentaFinancieraService.prototype.getMovimientos).mockResolvedValue(mockMovimientos as any);
      req.params = { id: 'c-1' };

      await controller.getMovimientos(req, res as Response);

      expect(CuentaFinancieraService.prototype.getMovimientos).toHaveBeenCalledWith(TENANT_ID, 'c-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockMovimientos });
    });

    it('debería retornar lista vacía si la cuenta no tiene movimientos', async () => {
      vi.mocked(CuentaFinancieraService.prototype.getMovimientos).mockResolvedValue([]);
      req.params = { id: 'c-2' };

      await controller.getMovimientos(req, res as Response);

      expect(CuentaFinancieraService.prototype.getMovimientos).toHaveBeenCalledWith(TENANT_ID, 'c-2');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: [] });
    });

    it('debería responder con 500 ante un error en getMovimientos', async () => {
      vi.mocked(CuentaFinancieraService.prototype.getMovimientos).mockRejectedValue(new Error('Query error'));
      req.params = { id: 'c-1' };

      await controller.getMovimientos(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Query error' });
    });
  });
});
