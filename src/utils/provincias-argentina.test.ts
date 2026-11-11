import { describe, expect, it } from 'vitest';
import { normalizarProvincia, PROVINCIAS_ARGENTINAS } from './provincias-argentina';

describe('Provincias argentinas', () => {
  it('incluye las 23 provincias y CABA sin duplicados', () => {
    expect(PROVINCIAS_ARGENTINAS).toHaveLength(24);
    expect(new Set(PROVINCIAS_ARGENTINAS).size).toBe(24);
    PROVINCIAS_ARGENTINAS.forEach((provincia) => expect(normalizarProvincia(provincia)).toBe(provincia));
  });

  it.each([
    [' cordoba ', 'Córdoba'], ['RIO   NEGRO', 'Río Negro'], ['Neuquen', 'Neuquén'],
    ['CABA', 'Ciudad Autónoma de Buenos Aires'], ['C.A.B.A.', 'Ciudad Autónoma de Buenos Aires'],
    ['Capital Federal', 'Ciudad Autónoma de Buenos Aires'], ['Bs. As.', 'Buenos Aires'],
    ['Tierra del Fuego', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur'],
  ])('normaliza %s', (valor, esperado) => expect(normalizarProvincia(valor)).toBe(esperado));

  it.each(['', '  ', null, undefined])('conserva el campo opcional (%s)', (valor) => {
    expect(normalizarProvincia(valor)).toBeNull();
  });

  it.each(['Rosario', 'Montevideo', 'Córdova', 5, {}, []])('rechaza provincias inexistentes o valores inválidos (%j)', (valor) => {
    expect(normalizarProvincia(valor)).toBeUndefined();
  });
});
