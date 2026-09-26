import { describe, it, expect } from 'vitest';
import {
  calcularCascada,
  calcularDescuentoMaximo,
  calcularPrecioMinimo,
  resolverDescuentoProducto,
} from './cascada-descuentos';

describe('resolverDescuentoProducto', () => {
  it('sin nada definido: no hay descuento', () => {
    expect(resolverDescuentoProducto(null, null)).toEqual({
      porcentaje: null,
      origen: 'sin-descuento',
    });
  });

  it('solo el general del producto: aplica a cualquier sucursal', () => {
    expect(resolverDescuentoProducto(null, 10)).toEqual({ porcentaje: 10, origen: 'producto' });
  });

  it('el de la sucursal pisa al general', () => {
    expect(resolverDescuentoProducto(5, 10)).toEqual({ porcentaje: 5, origen: 'sucursal' });
  });

  it('un 0 en la sucursal anula el general, no delega', () => {
    expect(resolverDescuentoProducto(0, 20)).toEqual({ porcentaje: 0, origen: 'sucursal' });
  });

  it('un 0 como general es un descuento válido', () => {
    expect(resolverDescuentoProducto(null, 0)).toEqual({ porcentaje: 0, origen: 'producto' });
  });

  it('undefined se trata igual que null', () => {
    expect(resolverDescuentoProducto(undefined, 15).porcentaje).toBe(15);
    expect(resolverDescuentoProducto(undefined, undefined).porcentaje).toBeNull();
  });
});

describe('calcularPrecioMinimo', () => {
  it('aplica costo × (1 + margen/100)', () => {
    expect(calcularPrecioMinimo(1000, 20)).toBe(1200);
  });

  it('sin costo o sin margen no hay piso', () => {
    expect(calcularPrecioMinimo(null, 20)).toBeNull();
    expect(calcularPrecioMinimo(1000, null)).toBeNull();
    expect(calcularPrecioMinimo(0, 20)).toBeNull();
  });
});

describe('calcularDescuentoMaximo', () => {
  it('es el margen entre el precio base y el piso', () => {
    // piso 1200 sobre base 2000 => se puede descontar hasta 40%
    expect(calcularDescuentoMaximo(2000, 1200)).toBe(40);
  });

  it('si el precio ya está en el piso, no se puede descontar nada', () => {
    expect(calcularDescuentoMaximo(1200, 1200)).toBe(0);
    expect(calcularDescuentoMaximo(1000, 1200)).toBe(0);
  });

  it('sin piso calculable devuelve null', () => {
    expect(calcularDescuentoMaximo(2000, null)).toBeNull();
  });
});

describe('calcularCascada', () => {
  it('sin descuentos deja el precio base', () => {
    const r = calcularCascada({ precioBase: 10000 });
    expect(r.precioFinal).toBe(10000);
    expect(r.descuentoEfectivo).toBe(0);
    expect(r.aportes).toHaveLength(0);
  });

  it('los tres primeros niveles componen, no suman', () => {
    const r = calcularCascada({
      precioBase: 10000,
      descuentoSucursal: 10,
      descuentoCategoria: 10,
      descuentoProducto: 10,
    });
    // 10000 → 9000 → 8100 → 7290
    expect(r.precioFinal).toBe(7290);
    expect(r.descuentoEfectivo).toBe(27.1);
    // la suma ingenua habría dado 30% => 7000
    expect(r.precioFinal).not.toBe(7000);
  });

  it('registra el precio resultante de cada nivel, en orden', () => {
    const r = calcularCascada({
      precioBase: 10000,
      descuentoSucursal: 10,
      descuentoCategoria: 10,
    });
    expect(r.aportes.map((a) => [a.nivel, a.precioResultante])).toEqual([
      ['sucursal', 9000],
      ['categoria', 8100],
    ]);
  });

  it('los niveles sin descuento no aparecen entre los aportes', () => {
    const r = calcularCascada({
      precioBase: 10000,
      descuentoSucursal: 0,
      descuentoCategoria: 10,
      descuentoProducto: null,
    });
    expect(r.aportes.map((a) => a.nivel)).toEqual(['categoria']);
    expect(r.precioFinal).toBe(9000);
  });

  it('el descuento del cliente se SUMA al efectivo acumulado', () => {
    const r = calcularCascada({
      precioBase: 10000,
      descuentoSucursal: 10,
      descuentoCategoria: 10,
      descuentoCliente: 5,
    });
    // cascada: 19% efectivo; + 5 del cliente = 24% => 7600
    expect(r.descuentoEfectivo).toBe(24);
    expect(r.precioFinal).toBe(7600);
  });

  it('el descuento del cliente solo, se aplica tal cual', () => {
    const r = calcularCascada({ precioBase: 10000, descuentoCliente: 15 });
    expect(r.precioFinal).toBe(8500);
    expect(r.descuentoEfectivo).toBe(15);
  });

  describe('tope por margen mínimo', () => {
    it('recorta el precio al piso y lo marca', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 50,
        costoReposicion: 6000,
        margenMinimo: 20,
      });
      // la cascada daría 5000, pero el piso es 7200
      expect(r.precioSinTope).toBe(5000);
      expect(r.precioFinal).toBe(7200);
      expect(r.topeAplicado).toBe(true);
      expect(r.descuentoEfectivo).toBe(28);
    });

    it('si la cascada no perfora el margen, no toca nada', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 10,
        costoReposicion: 6000,
        margenMinimo: 20,
      });
      expect(r.precioFinal).toBe(9000);
      expect(r.topeAplicado).toBe(false);
    });

    it('informa el descuento máximo posible aunque no se llegue al tope', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 5,
        costoReposicion: 6000,
        margenMinimo: 20,
      });
      // piso 7200 sobre 10000 => hasta 28%
      expect(r.descuentoMaximo).toBe(28);
      expect(r.topeAplicado).toBe(false);
    });

    it('sin costo o margen cargados no hay tope', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 90,
        costoReposicion: null,
        margenMinimo: null,
      });
      expect(r.precioFinal).toBe(1000);
      expect(r.topeAplicado).toBe(false);
      expect(r.descuentoMaximo).toBeNull();
    });
  });

  describe('casos límite', () => {
    it('precio base cero o inválido devuelve cero sin romper', () => {
      expect(calcularCascada({ precioBase: 0, descuentoSucursal: 10 }).precioFinal).toBe(0);
      expect(calcularCascada({ precioBase: NaN }).precioFinal).toBe(0);
    });

    it('ignora porcentajes negativos', () => {
      const r = calcularCascada({ precioBase: 10000, descuentoSucursal: -20 });
      expect(r.precioFinal).toBe(10000);
    });

    it('topea los porcentajes mayores a 100', () => {
      const r = calcularCascada({ precioBase: 10000, descuentoSucursal: 150 });
      expect(r.precioFinal).toBe(0);
    });

    it('el efectivo total no supera el 100% al sumar el del cliente', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 80,
        descuentoCliente: 50,
      });
      expect(r.descuentoEfectivo).toBe(100);
      expect(r.precioFinal).toBe(0);
    });
  });

  it('escenario completo de los cuatro niveles', () => {
    const r = calcularCascada({
      precioBase: 10000,
      descuentoSucursal: 10,
      descuentoCategoria: 10,
      descuentoProducto: 5,
      descuentoCliente: 5,
      costoReposicion: 4000,
      margenMinimo: 20,
    });
    // 10000 → 9000 → 8100 → 7695 (23.05% efectivo) + 5 del cliente = 28.05%
    expect(r.precioFinal).toBe(7195);
    expect(r.descuentoEfectivo).toBe(28.05);
    expect(r.aportes.map((a) => a.nivel)).toEqual([
      'sucursal',
      'categoria',
      'producto',
      'cliente',
    ]);
    expect(r.topeAplicado).toBe(false);
  });
});
