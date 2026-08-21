import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { OperacionController } from './operacion.controller';
import { OperacionService } from '../services/operacion.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { BusinessError } from '../utils/errors';

vi.mock('../services/operacion.service');
vi.mock('../utils/tenant');

describe('OperacionController', () => {
  let controller: OperacionController;
  let req: any;
  let res: Partial<Response>;
  const TENANT_ID = 'tenant-123';
  const AUTH_ID = 'auth-123';

  beforeEach(() => {
    controller = new OperacionController();
    req = {
      user: { id: AUTH_ID } as any,
      query: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.mocked(getTenantIdByAuthId).mockResolvedValue(TENANT_ID);
  });

  it('debería retornar todas las operaciones cuando no se pasa limit', async () => {
    const mockData = [
      { id: 'op-1', tipo_nombre: 'Venta', sucursal_nombre: 'Central', sucursal_id: 's-1' },
    ];
    vi.mocked(OperacionService.prototype.getAll).mockResolvedValue(mockData as any);

    req.query = { sucursalId: 's-1' };
    await controller.getAll(req, res as Response);

    expect(getTenantIdByAuthId).toHaveBeenCalledWith(AUTH_ID);
    expect(OperacionService.prototype.getAll).toHaveBeenCalledWith(TENANT_ID, 's-1', undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockData });
  });

  it('debería retornar operaciones paginadas con sucursalId', async () => {
    const mockResult = {
      items: [{ id: 'op-1', tipo_nombre: 'Venta', sucursal_id: 's-1' }],
      hasMore: false,
    };
    vi.mocked(OperacionService.prototype.getPaginated).mockResolvedValue(mockResult as any);

    req.query = { limit: '20', offset: '0', sucursalId: 's-1', tipoId: 't-1' };
    await controller.getAll(req, res as Response);

    expect(OperacionService.prototype.getPaginated).toHaveBeenCalledWith(
      TENANT_ID,
      20,
      0,
      's-1',
      't-1'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: mockResult.items,
      page: {
        hasMore: false,
      },
    });
  });

  it('debería filtrar únicamente por tipoId cuando no se pasa sucursalId', async () => {
    const mockResult = { items: [], hasMore: false };
    vi.mocked(OperacionService.prototype.getPaginated).mockResolvedValue(mockResult as any);

    req.query = { limit: '10', offset: '0', tipoId: 't-2' };
    await controller.getAll(req, res as Response);

    expect(OperacionService.prototype.getPaginated).toHaveBeenCalledWith(
      TENANT_ID,
      10,
      0,
      undefined,
      't-2'
    );
  });

  it('debería manejar errores y responder con 500', async () => {
    vi.mocked(getTenantIdByAuthId).mockRejectedValue(new Error('DB failure'));

    await controller.getAll(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB failure' });
  });

  describe('getById', () => {

    it('debería retornar 200 con la operación encontrada', async () => {
      const mockOp = {
        id: 'op-1',
        tipo_nombre: 'Venta',
        items: [{ id: 'item-1', producto_nombre: 'Cámara', cantidad: 2 }],
        cuentas: [{ id: 'oc-1', cuenta_nombre: 'Efectivo', porcentaje_venta: 100 }],
      };
      vi.mocked(OperacionService.prototype.getById).mockResolvedValue(mockOp as any);
      req.params = { id: 'op-1' };

      await controller.getById(req, res as Response);

      expect(OperacionService.prototype.getById).toHaveBeenCalledWith(TENANT_ID, 'op-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockOp });
    });

    it('debería retornar 404 si la operación no existe', async () => {
      vi.mocked(OperacionService.prototype.getById).mockResolvedValue(null as any);
      req.params = { id: 'op-999' };

      await controller.getById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Operación no encontrada' });
    });

    it('debería responder con 500 ante un error en getById', async () => {
      vi.mocked(OperacionService.prototype.getById).mockRejectedValue(new Error('DB Error'));
      req.params = { id: 'op-1' };

      await controller.getById(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });
  });

  describe('create', () => {
    const baseVenta = {
      tipo: 'venta',
      sucursal_id: 's-1',
      items: [{ producto_sucursal_id: 'ps-1', cantidad: 2 }],
      cuentas: [{ cuenta_financiera_id: 'cf-1', monto_ars: 1000 }],
      venta: { total_ars: 1000 },
    };

    it('debería crear una venta y retornar 201', async () => {
      const mockCreada = { id: 'op-1', tipo_nombre: 'Venta' };
      vi.mocked(OperacionService.prototype.crear).mockResolvedValue(mockCreada as any);

      req.body = baseVenta;
      await controller.create(req, res as Response);

      // El controller normaliza el modo de reparto antes de delegar al service.
      expect(OperacionService.prototype.crear).toHaveBeenCalledWith(TENANT_ID, AUTH_ID, {
        ...baseVenta,
        modo_reparto: 'monto',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCreada });
    });

    it('debería crear una compra válida', async () => {
      const mockCreada = { id: 'op-2', tipo_nombre: 'Compra' };
      vi.mocked(OperacionService.prototype.crear).mockResolvedValue(mockCreada as any);

      req.body = {
        tipo: 'compra',
        sucursal_id: 's-1',
        items: [{ producto_sucursal_id: 'ps-1', cantidad: 5 }],
        compra: { proveedor_id: 'prov-1' },
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debería crear un traslado válido', async () => {
      const mockCreada = { id: 'op-3', tipo_nombre: 'Traslado' };
      vi.mocked(OperacionService.prototype.crear).mockResolvedValue(mockCreada as any);

      req.body = {
        tipo: 'traslado',
        sucursal_id: 's-1',
        items: [{ producto_sucursal_id: 'ps-1', cantidad: 3 }],
        traslado: { sucursal_destino_id: 's-2' },
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debería crear un movimiento válido', async () => {
      const mockCreada = { id: 'op-4', tipo_nombre: 'Movimiento' };
      vi.mocked(OperacionService.prototype.crear).mockResolvedValue(mockCreada as any);

      req.body = {
        tipo: 'movimiento',
        sucursal_id: 's-1',
        movimiento: { tipo: 'ingreso', monto_ars: 500 },
        cuentas: [{ cuenta_financiera_id: 'cf-1', monto_ars: 500 }],
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debería retornar 400 si falta el campo tipo', async () => {
      req.body = { sucursal_id: 's-1' };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si falta sucursal_id', async () => {
      req.body = { tipo: 'venta' };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si items está vacío en una venta', async () => {
      req.body = { tipo: 'venta', sucursal_id: 's-1', items: [] };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si falta compra.proveedor_id', async () => {
      req.body = {
        tipo: 'compra',
        sucursal_id: 's-1',
        items: [{ producto_sucursal_id: 'ps-1', cantidad: 1 }],
        compra: {},
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si sucursal_destino_id es igual a sucursal_id en traslado', async () => {
      req.body = {
        tipo: 'traslado',
        sucursal_id: 's-1',
        items: [{ producto_sucursal_id: 'ps-1', cantidad: 1 }],
        traslado: { sucursal_destino_id: 's-1' },
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 si falta cuentas en movimiento', async () => {
      req.body = {
        tipo: 'movimiento',
        sucursal_id: 's-1',
        movimiento: { tipo: 'ingreso', monto_ars: 500 },
      };
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 400 ante un BusinessError (ej. stock insuficiente)', async () => {
      vi.mocked(OperacionService.prototype.crear).mockRejectedValue(new BusinessError('Stock insuficiente para Cámara'));

      req.body = baseVenta;
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Stock insuficiente para Cámara' });
    });

    it('debería retornar 500 ante un error genérico', async () => {
      vi.mocked(OperacionService.prototype.crear).mockRejectedValue(new Error('DB Error'));

      req.body = baseVenta;
      await controller.create(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
    });

    describe('reparto entre cuentas', () => {
      it('debería retornar 400 si modo_reparto no es válido', async () => {
        req.body = { ...baseVenta, modo_reparto: 'mitades' };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('debería retornar 400 si en modo porcentaje falta porcentaje_venta', async () => {
        req.body = {
          ...baseVenta,
          modo_reparto: 'porcentaje',
          cuentas: [{ cuenta_financiera_id: 'cf-1', monto_ars: 1000 }],
        };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('debería retornar 400 si en modo monto falta monto_ars', async () => {
        req.body = {
          ...baseVenta,
          modo_reparto: 'monto',
          cuentas: [{ cuenta_financiera_id: 'cf-1', porcentaje_venta: 100 }],
        };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('debería aceptar el reparto por porcentaje y propagar el modo al service', async () => {
        vi.mocked(OperacionService.prototype.crear).mockResolvedValue({ id: 'op-9' } as any);

        req.body = {
          ...baseVenta,
          modo_reparto: 'porcentaje',
          cuentas: [
            { cuenta_financiera_id: 'cf-1', porcentaje_venta: 50 },
            { cuenta_financiera_id: 'cf-2', porcentaje_venta: 50 },
          ],
        };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(OperacionService.prototype.crear).toHaveBeenCalledWith(
          TENANT_ID,
          AUTH_ID,
          expect.objectContaining({ modo_reparto: 'porcentaje' })
        );
      });

      it('los movimientos siempre reparten por monto, sin exigir monto_ars suelto', async () => {
        vi.mocked(OperacionService.prototype.crear).mockResolvedValue({ id: 'op-10' } as any);

        req.body = {
          tipo: 'movimiento',
          sucursal_id: 's-1',
          movimiento: { tipo: 'ingreso' },
          cuentas: [{ cuenta_financiera_id: 'cf-1', monto_ars: 500 }],
        };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(OperacionService.prototype.crear).toHaveBeenCalledWith(
          TENANT_ID,
          AUTH_ID,
          expect.objectContaining({ modo_reparto: 'monto' })
        );
      });

      it('debería retornar 400 si una cuenta viene sin cuenta_financiera_id', async () => {
        req.body = { ...baseVenta, cuentas: [{ monto_ars: 1000 }] };
        await controller.create(req, res as Response);

        expect(res.status).toHaveBeenCalledWith(400);
      });
    });
  });
});

