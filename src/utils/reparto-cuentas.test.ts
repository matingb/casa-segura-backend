import { describe, it, expect } from 'vitest';
import {
  calcularRepartoPorPorcentaje,
  calcularRepartoPorMonto,
  resolverReparto,
} from './reparto-cuentas';
import { BusinessError } from './errors';

const EFECTIVO = 'cuenta-efectivo';
const TARJETA = 'cuenta-tarjeta';

/** Efectivo sin recargo, Tarjeta con 10%. */
const extras = new Map<string, number>([
  [EFECTIVO, 0],
  [TARJETA, 10],
]);

describe('calcularRepartoPorPorcentaje', () => {
  it('reparte 50/50 sin recargos: el total es igual al subtotal', () => {
    const r = calcularRepartoPorPorcentaje(
      1000,
      [
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 50 },
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 50 },
      ],
      extras
    );

    expect(r.subtotalBase).toBe(1000);
    expect(r.totalRecargos).toBe(0);
    expect(r.total).toBe(1000);
    expect(r.cuentas.map((c) => c.monto_ars)).toEqual([500, 500]);
  });

  it('aplica el recargo sobre la parte asignada a cada cuenta', () => {
    const r = calcularRepartoPorPorcentaje(
      1000,
      [
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 50 },
        { cuenta_financiera_id: TARJETA, porcentaje_venta: 50 },
      ],
      extras
    );

    // Efectivo: base 500, sin recargo -> 500
    expect(r.cuentas[0]).toMatchObject({ base_ars: 500, porcentaje_extra: 0, monto_ars: 500 });
    // Tarjeta: base 500, +10% -> 550
    expect(r.cuentas[1]).toMatchObject({ base_ars: 500, porcentaje_extra: 10, monto_ars: 550 });

    expect(r.subtotalBase).toBe(1000);
    expect(r.totalRecargos).toBe(50);
    expect(r.total).toBe(1050);
  });

  it('rechaza cuando los porcentajes no suman 100', () => {
    expect(() =>
      calcularRepartoPorPorcentaje(
        1000,
        [
          { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 30 },
          { cuenta_financiera_id: TARJETA, porcentaje_venta: 50 },
        ],
        extras
      )
    ).toThrow(BusinessError);
  });

  it('acepta diferencias de centavos por redondeo', () => {
    const r = calcularRepartoPorPorcentaje(
      900,
      [
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 33.33 },
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 33.33 },
        { cuenta_financiera_id: EFECTIVO, porcentaje_venta: 33.34 },
      ],
      extras
    );
    expect(r.total).toBeCloseTo(900, 1);
  });
});

describe('calcularRepartoPorMonto', () => {
  it('deriva la base quitando el recargo del monto cobrado', () => {
    const r = calcularRepartoPorMonto(
      1000,
      [
        { cuenta_financiera_id: EFECTIVO, monto_ars: 500 },
        { cuenta_financiera_id: TARJETA, monto_ars: 550 },
      ],
      extras
    );

    // Tarjeta cobra 550 con 10% de recargo -> cubre 500 de base
    expect(r.cuentas[1].base_ars).toBe(500);
    expect(r.cuentas[1].monto_ars).toBe(550);
    expect(r.subtotalBase).toBe(1000);
    expect(r.total).toBe(1050);
  });

  it('calcula el porcentaje resultante de cada cuenta', () => {
    const r = calcularRepartoPorMonto(
      1000,
      [
        { cuenta_financiera_id: EFECTIVO, monto_ars: 250 },
        { cuenta_financiera_id: EFECTIVO, monto_ars: 750 },
      ],
      extras
    );
    expect(r.cuentas.map((c) => c.porcentaje_venta)).toEqual([25, 75]);
  });

  it('rechaza cuando las bases no cubren el subtotal', () => {
    expect(() =>
      calcularRepartoPorMonto(
        1000,
        [{ cuenta_financiera_id: EFECTIVO, monto_ars: 400 }],
        extras
      )
    ).toThrow(BusinessError);
  });
});

describe('resolverReparto', () => {
  it('delega según el modo elegido', () => {
    const porPorcentaje = resolverReparto(
      'porcentaje',
      1000,
      [{ cuenta_financiera_id: TARJETA, porcentaje_venta: 100 }],
      extras
    );
    expect(porPorcentaje.total).toBe(1100);

    const porMonto = resolverReparto(
      'monto',
      1000,
      [{ cuenta_financiera_id: TARJETA, monto_ars: 1100 }],
      extras
    );
    expect(porMonto.total).toBe(1100);
    expect(porMonto.subtotalBase).toBe(1000);
  });

  it('trata como 0 el recargo de una cuenta que no está en el mapa', () => {
    const r = resolverReparto(
      'porcentaje',
      500,
      [{ cuenta_financiera_id: 'cuenta-desconocida', porcentaje_venta: 100 }],
      extras
    );
    expect(r.cuentas[0].porcentaje_extra).toBe(0);
    expect(r.total).toBe(500);
  });
});
