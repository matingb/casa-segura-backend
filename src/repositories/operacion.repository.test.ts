import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../utils/db-transaction';
import { calcularEstadoFinanciero, OperacionRepository } from './operacion.repository';

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
