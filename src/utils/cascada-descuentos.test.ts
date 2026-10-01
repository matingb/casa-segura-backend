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

  describe('validación individual de cada nivel de descuento', () => {
    const BASE = 10000;

    it('producto sin descuento: mantiene precio base', () => {
      const r = calcularCascada({ precioBase: BASE });
      expect(r.precioFinal).toBe(10000);
      expect(r.descuentoEfectivo).toBe(0);
      expect(r.aportes).toHaveLength(0);
    });

    it('producto con descuento de región', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoRegionCliente: 15 });
      expect(r.precioFinal).toBe(8500);
      expect(r.descuentoEfectivo).toBe(15);
      expect(r.aportes).toEqual([
        { nivel: 'region-cliente', porcentaje: 15, montoDescontado: 1500, precioResultante: 8500 },
      ]);
    });

    it('solo descuento de sucursal', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoSucursal: 10 });
      expect(r.precioFinal).toBe(9000);
      expect(r.descuentoEfectivo).toBe(10);
      expect(r.aportes[0].nivel).toBe('sucursal');
    });

    it('solo descuento de categoría general', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoCategoria: 12 });
      expect(r.precioFinal).toBe(8800);
      expect(r.descuentoEfectivo).toBe(12);
      expect(r.aportes[0].nivel).toBe('categoria');
    });

    it('solo descuento de producto en sucursal', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoProducto: 8 });
      expect(r.precioFinal).toBe(9200);
      expect(r.descuentoEfectivo).toBe(8);
      expect(r.aportes[0].nivel).toBe('producto');
    });

    it('solo descuento de categoría cliente', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoCategoriaCliente: 20 });
      expect(r.precioFinal).toBe(8000);
      expect(r.descuentoEfectivo).toBe(20);
      expect(r.aportes[0].nivel).toBe('categoria-cliente');
    });

    it('solo descuento de producto cliente', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoProductoCliente: 25 });
      expect(r.precioFinal).toBe(7500);
      expect(r.descuentoEfectivo).toBe(25);
      expect(r.aportes[0].nivel).toBe('producto-cliente');
    });

    it('solo descuento habitual del cliente', () => {
      const r = calcularCascada({ precioBase: BASE, descuentoCliente: 10 });
      expect(r.precioFinal).toBe(9000);
      expect(r.descuentoEfectivo).toBe(10);
      expect(r.aportes[0].nivel).toBe('cliente');
    });
  });

  describe('cadena de descuentos del cliente (sub-niveles 4a, 4b, 4c)', () => {
    it('aplica solo descuento de región del cliente', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoRegionCliente: 10,
      });
      expect(r.precioFinal).toBe(9000);
      expect(r.descuentoEfectivo).toBe(10);
      expect(r.aportes).toEqual([
        { nivel: 'region-cliente', porcentaje: 10, montoDescontado: 1000, precioResultante: 9000 },
      ]);
    });

    it('aplica región y categoría en cascada', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoRegionCliente: 10,
        descuentoCategoriaCliente: 10,
      });
      // 10000 * 0.9 = 9000 -> 9000 * 0.9 = 8100 (19% efectivo compuesto)
      expect(r.precioFinal).toBe(8100);
      expect(r.descuentoEfectivo).toBe(19);
      expect(r.aportes.map((a) => a.nivel)).toEqual(['region-cliente', 'categoria-cliente']);
    });

    it('aplica los 3 sub-niveles del cliente en cascada', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoRegionCliente: 10,
        descuentoCategoriaCliente: 10,
        descuentoProductoCliente: 10,
      });
      // 10000 -> 9000 -> 8100 -> 7290 (27.1% compuesto)
      expect(r.precioFinal).toBe(7290);
      expect(r.descuentoEfectivo).toBe(27.1);
      expect(r.aportes.map((a) => a.nivel)).toEqual([
        'region-cliente',
        'categoria-cliente',
        'producto-cliente',
      ]);
    });

    it('cadena completa combinando niveles generales y del cliente', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 5,
        descuentoCategoria: 5,
        descuentoProducto: 5,
        descuentoRegionCliente: 5,
        descuentoCategoriaCliente: 5,
        descuentoProductoCliente: 5,
      });
      // 10000 * (0.95)^6 = 10000 * 0.73509189 = 7350.92
      expect(r.precioFinal).toBe(7350.92);
      expect(r.aportes.map((a) => a.nivel)).toEqual([
        'sucursal',
        'categoria',
        'producto',
        'region-cliente',
        'categoria-cliente',
        'producto-cliente',
      ]);
    });

    it('respeta el tope de margen mínimo con los sub-niveles del cliente y emite alerta', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoRegionCliente: 20,
        descuentoCategoriaCliente: 20,
        descuentoProductoCliente: 20,
        costoReposicion: 6000,
        margenMinimo: 10, // piso = 6000 * 1.1 = 6600
      });
      // 10000 * 0.8 * 0.8 * 0.8 = 5120 < 6600 -> topea a 6600
      expect(r.precioSinTope).toBe(5120);
      expect(r.precioFinal).toBe(6600);
      expect(r.topeAplicado).toBe(true);
      expect(r.analisisMargen.estado).toBe('tope_aplicado');
      expect(r.alertas.some((a) => a.tipo === 'tope_aplicado' && a.severidad === 'advertencia')).toBe(true);
      expect(r.gananciaUnitaria).toBe(600);
      expect(r.margenEfectivo).toBe(10);
    });
  });

  describe('análisis centralizado de margen de ganancias y alertas', () => {
    it('detecta rentabilidad saludable óptima', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 10, // precio = 9000
        costoReposicion: 5000,
        margenMinimo: 20, // piso = 6000
      });
      expect(r.precioFinal).toBe(9000);
      expect(r.gananciaUnitaria).toBe(4000);
      expect(r.margenEfectivo).toBe(80);
      expect(r.analisisMargen.estado).toBe('optimo');
      expect(r.alertas[0].tipo).toBe('margen_saludable');
      expect(r.alertas[0].severidad).toBe('info');
    });

    it('detecta margen ajustado cuando está cerca del mínimo', () => {
      const r = calcularCascada({
        precioBase: 10000,
        descuentoSucursal: 38, // precio = 6200
        costoReposicion: 5000,
        margenMinimo: 20, // piso = 6000, margenEfectivo = (1200/5000) = 24% (< 20 + 5)
      });
      expect(r.precioFinal).toBe(6200);
      expect(r.analisisMargen.estado).toBe('ajustado');
      expect(r.alertas.some((a) => a.tipo === 'margen_ajustado')).toBe(true);
    });

    it('detecta margen perforado con precio manual', () => {
      const r = calcularCascada({
        precioBase: 10000,
        precioManual: 5500,
        costoReposicion: 5000,
        margenMinimo: 20, // piso = 6000
      });
      expect(r.precioFinal).toBe(5500);
      expect(r.analisisMargen.margenPerforado).toBe(true);
      expect(r.analisisMargen.estado).toBe('perforado');
      expect(r.alertas.some((a) => a.tipo === 'margen_perforado' && a.severidad === 'critica')).toBe(true);
    });

    it('detecta venta en pérdida si el precio está por debajo del costo', () => {
      const r = calcularCascada({
        precioBase: 10000,
        precioManual: 4500,
        costoReposicion: 5000,
        margenMinimo: 20,
      });
      expect(r.gananciaUnitaria).toBe(-500);
      expect(r.analisisMargen.estado).toBe('en_perdida');
      expect(r.alertas.some((a) => a.tipo === 'en_perdida' && a.severidad === 'critica')).toBe(true);
    });
  });
});
