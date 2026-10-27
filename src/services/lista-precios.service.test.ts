import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ListaPreciosService } from './lista-precios.service';
import { pool } from '../config/db';

vi.mock('../config/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../repositories/cotizacion.repository', () => ({ CotizacionRepository: class {
  obtener = async () => ({ cotizacion_usd_ars: '1300.000000', cotizacion_version: '7', actualizada_at: null });
} }));

describe('ListaPreciosService: cero y margen', () => {
  beforeEach(() => vi.clearAllMocks());
  it('conserva el cero y advierte que no cubre un costo con margen configurado', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (sql.includes('FROM public.sucursal')) return { rows: [{ id: 'sucursal', nombre: 'Central' }] };
      if (sql.includes('FROM public.cliente WHERE')) return { rows: [{ id: 'cliente', nombre: 'Cliente', descuento_porcentaje: 0 }] };
      if (sql.includes('FROM public.producto_sucursal')) return { rows: [{ id: 'stock', producto_id: 'producto', nombre: 'Cero explícito', moneda_precio_efectiva: 'USD', precio_efectivo_usd: '0.0000', precio_efectivo_confirmado: true, costo_reposicion: '50000.00', margen_minimo: '10.00' }] };
      return { rows: [] };
    }) as typeof pool.query);
    const lista = await new ListaPreciosService().obtener('empresa', 'sucursal', 'cliente');
    expect(lista.items[0]).toMatchObject({ precioFinalUsd: '0.0000', precioFinalArs: '0.00', noAlcanzaMargen: true, precioMinimo: '55000.01' });
  });
});

describe('ListaPreciosService: descuentos generales', () => {
  beforeEach(() => vi.clearAllMocks());

  const producto = {
    id: 'stock', producto_id: 'producto', nombre: 'Cámara domo', moneda_precio_efectiva: 'ARS', precio_efectivo_ars: '10000.00',
    precio_efectivo_confirmado: true, descuento: null, descuento_base: null,
    tipo_id: 'camaras', subtipo_id: 'domo', tipo_descuento_general: null, subtipo_descuento_general: null,
  };

  function mockear({ sucursal = null, fila = {}, excepciones = [], categoriasCliente = [], region = null }: {
    sucursal?: string | null; fila?: Record<string, unknown>; excepciones?: unknown[];
    categoriasCliente?: unknown[]; region?: unknown;
  }) {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (sql.includes('descuento_categoria_sucursal')) return { rows: excepciones };
      if (sql.includes('FROM public.sucursal')) return { rows: [{ id: 'sucursal', nombre: 'Central', descuento: sucursal }] };
      if (sql.includes('FROM public.cliente WHERE')) return { rows: [{ id: 'cliente', nombre: 'Cliente', descuento_porcentaje: null }] };
      if (sql.includes('FROM public.producto_sucursal')) return { rows: [{ ...producto, ...fila }] };
      if (sql.includes('cliente_descuento_categoria')) return { rows: categoriasCliente };
      if (sql.includes('cliente_region')) return { rows: region ? [region] : [] };
      return { rows: [] };
    }) as typeof pool.query);
    return new ListaPreciosService().obtener('empresa', 'sucursal', 'cliente');
  }

  it('aplica los generales antes que los del cliente, en cadena', async () => {
    const lista = await mockear({
      sucursal: '5.00',
      fila: { tipo_descuento_general: '5.00' },
      region: { nombre: 'Cuyo', descuento: '10.00' },
    });
    expect(lista.items[0].precioFinalArs).toBe('8122.50');
    expect(lista.items[0].descuentosAportes).toEqual([
      { nivel: 'sucursal', porcentaje: 5 },
      { nivel: 'categoria', porcentaje: 5 },
      { nivel: 'region-cliente', porcentaje: 10 },
    ]);
  });

  it('el descuento de categoría del cliente reemplaza al general de categoría', async () => {
    const lista = await mockear({
      sucursal: '5.00',
      fila: { tipo_descuento_general: '5.00' },
      region: { nombre: 'Cuyo', descuento: '10.00' },
      categoriasCliente: [{ tipo_id: 'camaras', subtipo_id: null, porcentaje: '10.00' }],
    });
    // 10000 → 9500 (sucursal) → 8550 (región) → 7695 (categoría del cliente); el 5% general no se aplica
    expect(lista.items[0]).toMatchObject({ precioFinalArs: '7695.00', descuentoCategoriaGeneral: 5 });
    expect(lista.items[0].descuentosAportes.map((a) => a.nivel)).toEqual(['sucursal', 'region-cliente', 'categoria-cliente']);
  });

  it('también con subcategorías: el del cliente reemplaza al general aunque sea de otro nivel', async () => {
    const lista = await mockear({
      fila: { subtipo_descuento_general: '15.00' },
      categoriasCliente: [{ tipo_id: 'camaras', subtipo_id: null, porcentaje: '10.00' }],
    });
    expect(lista.items[0].precioFinalArs).toBe('9000.00');
    expect(lista.items[0].descuentosAportes).toEqual([{ nivel: 'categoria-cliente', porcentaje: 10 }]);
  });

  it('la excepción de subcategoría en la sucursal tiene prioridad sobre la categoría', async () => {
    const lista = await mockear({
      fila: { tipo_descuento_general: '5.00' },
      excepciones: [{ tipo_id: null, subtipo_id: 'domo', porcentaje: '8.00' }],
    });
    expect(lista.items[0].descuentosAportes).toEqual([{ nivel: 'categoria', porcentaje: 8 }]);
  });

  it('sin descuento en la sucursal hereda el descuento general del producto', async () => {
    const lista = await mockear({ fila: { descuento_base: '10.00' } });
    expect(lista.items[0].precioFinalArs).toBe('9000.00');
    expect(lista.items[0].descuentosAportes).toEqual([{ nivel: 'producto', porcentaje: 10 }]);
  });

  it('la lista general aplica solo los niveles generales, sin pedir cliente', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (sql.includes('descuento_categoria_sucursal')) return { rows: [] };
      if (sql.includes('FROM public.sucursal')) return { rows: [{ id: 'sucursal', nombre: 'Central', descuento: '5.00' }] };
      if (sql.includes('FROM public.producto_sucursal')) return { rows: [{ ...producto, tipo_descuento_general: '5.00' }] };
      throw new Error(`consulta inesperada: ${sql}`);
    }) as typeof pool.query);
    const lista = await new ListaPreciosService().obtenerGeneral('empresa', 'sucursal');
    expect(lista.items[0].precioFinalArs).toBe('9025.00');
    expect(lista.items[0].descuentosAportes.map((a) => a.nivel)).toEqual(['sucursal', 'categoria']);
  });

  it('el descuento del cliente en el producto reemplaza al general, que igual se informa', async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) => {
      if (sql.includes('descuento_categoria_sucursal')) return { rows: [] };
      if (sql.includes('FROM public.sucursal')) return { rows: [{ id: 'sucursal', nombre: 'Central', descuento: null }] };
      if (sql.includes('FROM public.cliente WHERE')) return { rows: [{ id: 'cliente', nombre: 'Cliente', descuento_porcentaje: null }] };
      if (sql.includes('FROM public.producto_sucursal')) return { rows: [{ ...producto, descuento_base: '20.00' }] };
      if (sql.includes('cliente_descuento_producto')) return { rows: [{ producto_id: 'producto', porcentaje: '5.00' }] };
      return { rows: [] };
    }) as typeof pool.query);
    const lista = await new ListaPreciosService().obtener('empresa', 'sucursal', 'cliente');
    expect(lista.items[0]).toMatchObject({ precioFinalArs: '9500.00', descuentoProductoGeneral: 20 });
    expect(lista.items[0].descuentosAportes).toEqual([{ nivel: 'producto-cliente', porcentaje: 5 }]);
  });

  it('un 0% cargado en la sucursal pisa el descuento general del producto', async () => {
    const lista = await mockear({ fila: { descuento: '0.00', descuento_base: '10.00' } });
    expect(lista.items[0].precioFinalArs).toBe('10000.00');
    expect(lista.items[0].descuentosAportes).toEqual([]);
  });
});
