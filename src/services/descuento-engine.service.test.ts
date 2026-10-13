import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DescuentoEngineService } from './descuento-engine.service';
import { pool } from '../config/db';

vi.mock('../config/db', () => ({
  pool: {
    query: vi.fn(),
  },
}));

describe('DescuentoEngineService', () => {
  let service: DescuentoEngineService;
  const TENANT_ID = 'tenant-1';
  const SUCURSAL_ID = 'suc-1';
  const CLIENTE_ID = 'cli-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DescuentoEngineService();
  });

  it('evalúa una operación aplicando sucursal, región, categoría, producto y margen', async () => {
    // 1. Mock sucursal (10% descuento sucursal)
    vi.mocked(pool.query).mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM public.sucursal')) {
        return {
          rows: [{ id: SUCURSAL_ID, nombre: 'Central', descuento: 10 }],
        } as any;
      }
      if (sql.includes('FROM public.cliente WHERE')) {
        return {
          rows: [{ id: CLIENTE_ID, nombre: 'Seguridad SRL', descuento_porcentaje: 5 }],
        } as any;
      }
      if (sql.includes('FROM public.cliente_region')) {
        return {
          rows: [{ id: 'reg-1', nombre: 'Interior', descuento: 8 }],
        } as any;
      }
      if (sql.includes('FROM public.cliente_descuento_categoria')) {
        return {
          rows: [{ tipo_id: 'tipo-1', subtipo_id: null, porcentaje: 12 }],
        } as any;
      }
      if (sql.includes('FROM public.cliente_descuento_producto')) {
        return {
          rows: [{ producto_id: 'prod-1', porcentaje: 5 }],
        } as any;
      }
      if (sql.includes('FROM public.producto_sucursal ps')) {
        return {
          rows: [
            {
              producto_sucursal_id: 'ps-1',
              producto_id: 'prod-1',
              codigo: 'P01',
              nombre: 'Cámara IP',
              precio_base: 20000,
              costo_reposicion: 10000,
              margen_minimo: 40, // piso = 14000
              descuento_producto_sucursal: null,
              descuento_producto_base: 5,
              tipo_id: 'tipo-1',
              subtipo_id: null,
              tipo_descuento_general: 10,
              subtipo_descuento_general: null,
            },
          ],
        } as any;
      }
      if (sql.includes('FROM public.descuento_categoria_sucursal')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    const resultado = await service.evaluarOperacion(TENANT_ID, SUCURSAL_ID, CLIENTE_ID, [
      { productoSucursalId: 'ps-1', cantidad: 2 },
    ]);

    expect(resultado.sucursal.nombre).toBe('Central');
    expect(resultado.cliente?.nombre).toBe('Seguridad SRL');
    expect(resultado.cliente?.regionNombre).toBe('Interior');
    expect(resultado.items.length).toBe(1);

    const item = resultado.items[0];
    expect(item.nombre).toBe('Cámara IP');
    expect(item.precioBase).toBe(20000);
    // Cascada (la categoría y el producto del cliente reemplazan a los generales):
    // Base: 20000
    // Sucursal: 10% -> 18000
    // Region cliente: 8% -> 16560
    // Cat cliente: 12% -> 14572.8
    // Prod cliente: 5% -> 13844.16
    // Habitual: 5% -> 13151.95
    // Pero piso margen (costo 10000 * 1.4 = 14000)
    // El precio quedó por debajo de 14000, por lo tanto topeAplicado = true y precioFinal = 14000!
    expect(item.resultadoCascada.precioSinTope).toBe(13151.95);
    expect(item.resultadoCascada.aportes.map((a) => a.nivel)).toEqual(['sucursal', 'region-cliente', 'categoria-cliente', 'producto-cliente', 'cliente']);
    expect(item.precioFinal).toBe(14000);
    expect(item.analisisMargen.topeAplicado).toBe(true);
    expect(item.analisisMargen.estado).toBe('tope_aplicado');
    expect(item.analisisMargen.gananciaUnitaria).toBe(4000);
    expect(item.analisisMargen.margenEfectivo).toBe(40);
    expect(item.alertas.some((a) => a.tipo === 'tope_aplicado')).toBe(true);

    expect(resultado.resumen.subtotalBase).toBe(40000);
    expect(resultado.resumen.totalFinal).toBe(28000);
    expect(resultado.resumen.gananciaTotalEstimada).toBe(8000);
    expect(resultado.resumen.hayTopeAplicado).toBe(true);
  });
});
