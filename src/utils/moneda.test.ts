import { describe, expect, it } from 'vitest';
import { costoArsVigente, decimalValido, prepararCosto, prepararPrecio, resolverPrecio } from './moneda';
const contexto = { cotizacion_usd_ars: '1200.000000', cotizacion_version: '3', actualizada_at: null };
describe('Precios de catálogo', () => {
  it('conserva el principal USD y sus cuatro decimales', () => {
    expect(resolverPrecio('USD', '0.1234', contexto)).toMatchObject({ importe_referencia: '0.1234', usd: '0.1234', ars: '148.08' });
    expect(resolverPrecio('USD', '100', { ...contexto, cotizacion_usd_ars: '1000' })).toMatchObject({ usd: '100.0000', ars: '100000.00' });
  });
  it('conserva el principal ARS y redondea solo el equivalente', () => {
    expect(resolverPrecio('ARS', '100000', contexto)).toMatchObject({ ars: '100000.00', usd: '83.3333' });
    expect(resolverPrecio('USD', '0.0001', { ...contexto, cotizacion_usd_ars: '50' }).ars).toBe('0.01');
  });
  it('distingue ausencia y cero sin cotización', () => {
    const sin = { ...contexto, cotizacion_usd_ars: null };
    expect(resolverPrecio('ARS', null, sin)).toMatchObject({ ars: null, usd: null, estado: 'SIN_PRECIO' });
    expect(resolverPrecio('ARS', '0', sin)).toMatchObject({ ars: '0.00', usd: null, estado: 'SIN_COTIZACION' });
    expect(prepararPrecio(null, sin).importe_referencia).toBeNull();
  });
  it.each(['NaN', 'Infinity', '-1', '0', '1.1234567', '1000000000000'])('rechaza una tasa inválida %s', valor => {
    expect(() => decimalValido(valor, 'Cotización', 6, 12, true)).toThrow();
  });
  it('rechaza versión anterior, escala y conversión fuera de rango', () => {
    expect(() => prepararPrecio({ moneda_referencia: 'USD', importe_referencia: '100', cotizacion_version: '2' }, contexto)).toThrow('Cambió');
    expect(() => prepararPrecio({ moneda_referencia: 'USD', importe_referencia: '0.12345', cotizacion_version: '3' }, contexto)).toThrow('decimales');
    expect(() => prepararPrecio({ moneda_referencia: 'USD', importe_referencia: '9999999999', cotizacion_version: '3' }, contexto)).toThrow('rango');
  });
});
describe('Costo de reposición', () => {
  const sin = { ...contexto, cotizacion_usd_ars: null };
  it('acepta un costo ARS sin cotización ni versión', () => {
    expect(prepararCosto({ moneda_referencia: 'ARS', importe_referencia: '1500.5', cotizacion_version: '0' }, sin)).toMatchObject({ ars: '1500.50', usd: null, moneda_referencia: 'ARS' });
  });
  it('un costo USD exige la cotización vigente', () => {
    expect(prepararCosto({ moneda_referencia: 'USD', importe_referencia: '10.1234', cotizacion_version: '3' }, contexto)).toMatchObject({ usd: '10.1234', ars: '12148.08' });
    expect(() => prepararCosto({ moneda_referencia: 'USD', importe_referencia: '10', cotizacion_version: '2' }, contexto)).toThrow('Cambió');
    expect(() => prepararCosto({ moneda_referencia: 'USD', importe_referencia: '10', cotizacion_version: '3' }, sin)).toThrow('dólar');
  });
  it('resuelve el costo ARS vigente según la moneda guardada', () => {
    expect(costoArsVigente('ARS', '1000', null, sin)).toBe('1000.00');
    expect(costoArsVigente('USD', '900', '10', contexto)).toBe('12000.00');
    expect(costoArsVigente('USD', '900', null, contexto)).toBeNull();
    expect(() => costoArsVigente('USD', '900', '10', sin)).toThrow();
  });
});
