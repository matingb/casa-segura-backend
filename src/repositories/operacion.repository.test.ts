import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../utils/db-transaction';
import { calcularEstadoFinanciero, calcularEstadoStock, OperacionRepository } from './operacion.repository';

vi.mock('../utils/db-transaction', () => ({
  withTransaction: vi.fn(),
}));

describe('calcularEstadoFinanciero', () => {
  it('distingue pendiente, parcial, saldada y sobrepagada con tolerancia de centavos', () => {
    expect(calcularEstadoFinanciero(1_000, 0)).toBe('PENDIENTE');
    expect(calcularEstadoFinanciero(1_000, 350)).toBe('PARCIAL');
    expect(calcularEstadoFinanciero(1_000, 1_000.005)).toBe('SALDADA');
    expect(calcularEstadoFinanciero(1_000, 1_000.02)).toBe('SOBREPAGADA');
  });
});

describe('calcularEstadoStock', () => {
  it('deriva pendiente, parcial y completo a partir de los acumulados por línea', () => {
    expect(calcularEstadoStock([
      { cantidad: 10, cantidad_impactada_stock: 0 },
      { cantidad: 5, cantidad_impactada_stock: 0 },
    ])).toBe('PENDIENTE');
    expect(calcularEstadoStock([
      { cantidad: 10, cantidad_impactada_stock: 4 },
      { cantidad: 5, cantidad_impactada_stock: 0 },
    ])).toBe('PARCIAL');
    expect(calcularEstadoStock([
      { cantidad: 10, cantidad_impactada_stock: 10 },
      { cantidad: 5, cantidad_impactada_stock: 5 },
    ])).toBe('COMPLETO');
  });
});

describe('OperacionRepository.eliminarPago', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revierte el saldo de la cuenta y recalcula el estado con los pagos restantes', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'op-1', tipo_nombre: 'Compra', total_ars: 1000, cancelled_at: null }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'pago-a', cuenta_financiera_id: 'cuenta-a', monto_ars: 250 },
            { id: 'pago-b', cuenta_financiera_id: 'cuenta-b', monto_ars: 300 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'cuenta-a' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;
    vi.mocked(withTransaction).mockImplementation((callback) => callback(client));

    const repo = new OperacionRepository();
    vi.spyOn(repo, 'findById').mockResolvedValue({ id: 'op-1' } as any);

    await expect(repo.eliminarPago('tenant-1', 'op-1', 'pago-a')).resolves.toEqual({ id: 'op-1' });

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF o'), ['op-1', 'tenant-1']);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.cuenta_financiera SET saldo_actual = saldo_actual + $1'),
      [250, 'cuenta-a']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.operacion_cuenta'),
      ['pago-a', 'op-1']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET estado_financiero = $2'),
      ['op-1', 'PARCIAL']
    );
  });
});

describe('OperacionRepository.registrarImpactoStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('descuenta únicamente el nuevo impacto de una venta y actualiza el acumulado en la misma transacción', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'op-1', tipo_nombre: 'Venta', cancelled_at: null }] })
        .mockResolvedValueOnce({ rows: [{
          id: 'detalle-1',
          producto_sucursal_id: 'stock-1',
          cantidad: 10,
          cantidad_impactada_stock: 4,
          producto_nombre: 'Cámara',
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 'stock-1', cantidad_disponible: 8, producto_nombre: 'Cámara' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;
    vi.mocked(withTransaction).mockImplementation((callback) => callback(client));

    const repo = new OperacionRepository();
    vi.spyOn(repo, 'findById').mockResolvedValue({ id: 'op-1', estado_stock: 'PARCIAL' } as any);

    await expect(repo.registrarImpactoStock('tenant-1', 'op-1', {
      items: [{ operacion_detalle_id: 'detalle-1', cantidad: 3 }],
    })).resolves.toMatchObject({ id: 'op-1', estado_stock: 'PARCIAL' });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET cantidad_impactada_stock = cantidad_impactada_stock + $1'),
      [3, 'detalle-1']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('ultima_modificacion_stock_at = NOW()'),
      [3, 'detalle-1']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET cantidad_disponible = cantidad_disponible + $1'),
      [-3, 'stock-1']
    );
  });

  it('rechaza una recepción mayor a la cantidad pendiente antes de modificar el stock', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'op-1', tipo_nombre: 'Compra', cancelled_at: null }] })
        .mockResolvedValueOnce({ rows: [{
          id: 'detalle-1',
          producto_sucursal_id: 'stock-1',
          cantidad: 5,
          cantidad_impactada_stock: 4,
          producto_nombre: 'Cámara',
        }] }),
    } as any;
    vi.mocked(withTransaction).mockImplementation((callback) => callback(client));

    const repo = new OperacionRepository();

    await expect(repo.registrarImpactoStock('tenant-1', 'op-1', {
      items: [{ operacion_detalle_id: 'detalle-1', cantidad: 2 }],
    })).rejects.toThrow('no superar las 1 unidades pendientes');

    expect(client.query).toHaveBeenCalledTimes(2);
  });
});

describe('OperacionRepository.crear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no ajusta el stock de las líneas cuyo impacto inicial es cero', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'op-1' }] }),
    } as any;
    vi.mocked(withTransaction).mockImplementation((callback) => callback(client));

    const repo = new OperacionRepository();
    vi.spyOn(repo as any, 'resolverUsuarioSucursal').mockResolvedValue('usuario-sucursal-1');
    vi.spyOn(repo as any, 'resolverTipoId').mockResolvedValue('tipo-compra-1');
    const insertDetalle = vi.spyOn(repo as any, 'insertDetalle').mockResolvedValue(undefined);
    vi.spyOn(repo as any, 'insertExtension').mockResolvedValue(undefined);
    const ajustarStockCompra = vi.spyOn(repo as any, 'ajustarStockCompra').mockResolvedValue(undefined);
    vi.spyOn(repo as any, 'ajustarSaldos').mockResolvedValue(undefined);
    vi.spyOn(repo, 'findById').mockResolvedValue({ id: 'op-1' } as any);

    await expect(repo.crear('tenant-1', 'auth-1', {
      tipo: 'Compra',
      sucursal_id: 'sucursal-1',
      registrar_finanzas_ahora: false,
      items: [
        { producto_sucursal_id: 'stock-pendiente', cantidad: 5, cantidad_impactada_stock: 0 },
        { producto_sucursal_id: 'stock-recibido', cantidad: 4, cantidad_impactada_stock: 2 },
      ],
      compra: { proveedor_id: 'proveedor-1' },
    })).resolves.toEqual({ id: 'op-1' });

    expect(insertDetalle).toHaveBeenCalledWith(
      client,
      'op-1',
      expect.arrayContaining([
        expect.objectContaining({ producto_sucursal_id: 'stock-pendiente', cantidad_impactada_stock: 0 }),
        expect.objectContaining({ producto_sucursal_id: 'stock-recibido', cantidad_impactada_stock: 2 }),
      ]),
      true
    );
    expect(ajustarStockCompra).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        producto_sucursal_id: 'stock-recibido',
        cantidad: 2,
        cantidad_impactada_stock: 2,
      }),
    ]);
  });
});
