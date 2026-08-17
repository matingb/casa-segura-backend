import { describe, it, expect } from 'vitest';
import {
  normalizePaginationLimit,
  getLimitSentinel,
  sliceWithHasMore,
  DEFAULT_LIMIT,
  MIN_LIMIT,
} from './pagination';

describe('normalizePaginationLimit', () => {
  it('devuelve DEFAULT_LIMIT cuando el input es undefined', () => {
    expect(normalizePaginationLimit(undefined)).toBe(DEFAULT_LIMIT);
  });

  it('devuelve DEFAULT_LIMIT cuando el input es NaN', () => {
    expect(normalizePaginationLimit('abc')).toBe(DEFAULT_LIMIT);
  });

  it('parsea correctamente un string numérico', () => {
    expect(normalizePaginationLimit('25')).toBe(25);
  });

  it('trunca decimales', () => {
    expect(normalizePaginationLimit(10.9)).toBe(10);
  });

  it('devuelve MIN_LIMIT cuando el input es menor a 1', () => {
    expect(normalizePaginationLimit(0)).toBe(MIN_LIMIT);
    expect(normalizePaginationLimit(-5)).toBe(MIN_LIMIT);
  });
});

describe('getLimitSentinel', () => {
  it('Devuelve limit + 1 para saber si hay más resultados sin contar toda la tabla.', () => {
    expect(getLimitSentinel(50)).toBe(51);
    expect(getLimitSentinel(1)).toBe(2);
  });

  it('trunca decimales', () => {
    expect(getLimitSentinel(10.9)).toBe(11);
  });
});

describe('sliceWithHasMore', () => {
  const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

  it('devuelve hasMore=false cuando hay exactamente limit filas', () => {
    const rows = makeRows(3);
    const result = sliceWithHasMore(rows, 3);
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(3);
  });

  it('devuelve hasMore=false cuando hay menos de limit filas', () => {
    const rows = makeRows(2);
    const result = sliceWithHasMore(rows, 5);
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(2);
  });

  it('devuelve hasMore=true y corta al limit cuando hay limit+1 filas (sentinel)', () => {
    const rows = makeRows(4); // sentinel de limit=3
    const result = sliceWithHasMore(rows, 3);
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(3);
  });

  it('no muta el array original', () => {
    const rows = makeRows(4);
    const original = [...rows];
    sliceWithHasMore(rows, 3);
    expect(rows).toEqual(original);
  });
});
