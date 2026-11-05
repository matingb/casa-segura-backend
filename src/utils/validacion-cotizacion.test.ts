import { describe, expect, it, vi } from 'vitest';
import { validarRangoCotizacion } from './validacion-cotizacion';

describe('validarRangoCotizacion', () => {
  it('revisa el catálogo global y las sucursales que heredan la tasa general', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ fuera_de_rango: false }] }) } as any;

    await validarRangoCotizacion(client, 'tenant', '1400.000000');

    const [sql, parametros] = client.query.mock.calls[0];
    expect(parametros).toEqual(['tenant', '1400.000000']);
    expect(sql).toContain('p.precio_base');
    expect(sql).toContain('p.costo_reposicion_base');
    expect(sql).toContain('s.valor_dolar IS NULL');
    expect(sql).toContain('ars / $2::numeric >= 10000000000');
  });

  it('revisa el precio heredado del producto y los costos solo en el PDV destino', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ fuera_de_rango: false }] }) } as any;

    await validarRangoCotizacion(client, 'tenant', '1300.000000', 'sucursal');

    const [sql, parametros] = client.query.mock.calls[0];
    expect(parametros).toEqual(['tenant', '1300.000000', 'sucursal']);
    expect(sql).toContain('p.precio_base_usd');
    expect(sql).toContain('ps.costo_reposicion_usd');
    expect(sql).toContain('ps.sucursal_id = $3');
    expect(sql).not.toContain('s.valor_dolar IS NULL');
  });

  it('rechaza una tasa cuyo equivalente rebasa los límites monetarios', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ fuera_de_rango: true }] }) } as any;

    await expect(validarRangoCotizacion(client, 'tenant', '999999.000000', 'sucursal'))
      .rejects.toMatchObject({ code: 'PRECIO_FUERA_DE_RANGO' });
  });
});
