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
      if (sql.includes('FROM public.producto_sucursal')) return { rows: [{ id: 'stock', producto_id: 'producto', nombre: 'Cero explícito', moneda_precio_venta: 'USD', precio_venta_usd: '0.0000', precio_referencia_confirmada: true, costo_reposicion: '50000.00', margen_minimo: '10.00' }] };
      return { rows: [] };
    }) as typeof pool.query);
    const lista = await new ListaPreciosService().obtener('empresa', 'sucursal', 'cliente');
    expect(lista.items[0]).toMatchObject({ precioFinalUsd: '0.0000', precioFinalArs: '0.00', noAlcanzaMargen: true, precioMinimo: '55000.01' });
  });
});
