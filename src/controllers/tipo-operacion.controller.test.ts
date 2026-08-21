import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { TipoOperacionController } from './tipo-operacion.controller';
import { TipoOperacionService } from '../services/tipo-operacion.service';

vi.mock('../services/tipo-operacion.service');

describe('TipoOperacionController', () => {
  let controller: TipoOperacionController;
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    controller = new TipoOperacionController();
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  it('debería retornar 200 con los tipos de operación', async () => {
    const mockTipos = [
      { id: 't1', nombre: 'Compra' },
      { id: 't2', nombre: 'Venta' },
      { id: 't3', nombre: 'Traslado' },
      { id: 't4', nombre: 'Movimiento' },
    ];

    vi.mocked(TipoOperacionService.prototype.getAll).mockResolvedValue(mockTipos as any);

    await controller.getAll(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockTipos });
  });

  it('debería responder con 500 ante un error', async () => {
    vi.mocked(TipoOperacionService.prototype.getAll).mockRejectedValue(new Error('DB Error'));

    await controller.getAll(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'DB Error' });
  });
});
