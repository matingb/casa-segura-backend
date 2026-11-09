import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aplicarAumento, vistaPreviaAumento } from './aumento-precios.service';
import { resolverPrecio } from '../utils/moneda';

const db = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
const cotizacion = vi.hoisted(() => ({ cotizacion_usd_ars: '1000', cotizacion_version: '7', actualizada_at: null }));
vi.mock('../config/db', () => ({ pool: db }));
vi.mock('../repositories/cotizacion.repository', () => ({
  CotizacionRepository: class {
    obtener = async () => cotizacion;
    obtenerPorSucursal = async () => cotizacion;
  },
}));

const tenantId = '00000000-0000-0000-0000-000000000001';
const sucursalId = '00000000-0000-0000-0000-000000000002';
const proveedorId = '00000000-0000-0000-0000-000000000003';
const idA = '00000000-0000-0000-0000-000000000004';
const idB = '00000000-0000-0000-0000-000000000005';
const idC = '00000000-0000-0000-0000-000000000006';
const acceso = { tenantId, sucursalIds: [sucursalId], sucursalesActivasIds: [sucursalId], authId: 'auth', usuarioId: 'usuario' };
const ajustePrecio = { campo: 'precio', modo: 'porcentaje', porcentaje: '5' };
const global = { alcance: 'productos', ajustes: [ajustePrecio], seleccion: 'todos' };
const stock = { ...global, alcance: 'stock', sucursalId };

function fila(id: string, moneda: 'ARS' | 'USD', importe: string | null) {
  return {
    id, codigo: id.slice(-1), nombre: 'Producto', marca: 'Marca', heredado: false, margen: null,
    precio: resolverPrecio(moneda, importe, cotizacion),
    costo: resolverPrecio('ARS', '80', cotizacion),
  };
}

function consultas(filas: object[]) {
  db.query.mockImplementation(async (sql: string, valores?: string[]) => {
    if (sql.trimStart().startsWith('SELECT')) return { rows: filas };
    if (sql.trimStart().startsWith('UPDATE')) return { rowCount: JSON.parse(valores![0]).length };
    return { rows: [] };
  });
}

describe('Ajuste masivo de precios y costos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.connect.mockResolvedValue({ query: db.query, release: vi.fn() });
  });

  it('calcula en cada moneda, aplica excepciones y omite filas excluidas o sin precio', async () => {
    consultas([fila(idA, 'ARS', '100'), fila(idB, 'USD', '1.2345'), fila(idC, 'ARS', null)]);
    const vista = await vistaPreviaAumento(acceso, global);
    expect(vista.filas.map(({ campos }) => [campos.precio?.propuesta, campos.precio?.motivo])).toEqual([
      ['105.00', null], ['1.2962', null], [null, 'Sin precio'],
    ]);
    await expect(aplicarAumento(acceso, {
      ...global, version: vista.version, excluidos: [idA], importes: { [idB]: { precio: '1.3500' } },
    })).resolves.toEqual({ actualizados: 1 });
    const update = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE public.producto p'));
    expect(JSON.parse(update![1][0])).toEqual([{ id: idB, precio: { ars: '1350.00', usd: '1.3500', moneda: 'USD' } }]);
    expect(db.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rechaza una vista previa desactualizada y revierte la transacción sin aplicar filas', async () => {
    consultas([fila(idA, 'ARS', '100')]);
    const vista = await vistaPreviaAumento(acceso, global);
    consultas([fila(idA, 'ARS', '105')]);
    await expect(aplicarAumento(acceso, { ...global, version: vista.version })).rejects.toMatchObject({ status: 409 });
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(db.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('permite incluir precios heredados solo en la sucursal autorizada', async () => {
    consultas([{ ...fila(idA, 'ARS', '100'), heredado: true }]);
    expect((await vistaPreviaAumento(acceso, stock)).filas[0].campos.precio).toMatchObject({ editable: false, motivo: 'Precio heredado' });
    const criterios = { ...stock, incluirHeredados: true };
    const vista = await vistaPreviaAumento(acceso, criterios);
    await expect(aplicarAumento(acceso, { ...criterios, version: vista.version })).resolves.toEqual({ actualizados: 1 });
    const [sql, valores] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE public.producto_sucursal ps'))!;
    expect(sql).toContain('precio_referencia_confirmada = cambio.precio IS NOT NULL');
    expect(valores.slice(1)).toEqual([tenantId, sucursalId]);
    await expect(vistaPreviaAumento(acceso, { ...stock, sucursalId: idB })).rejects.toMatchObject({ status: 403 });
  });

  it('combina proveedor y marca, y permite cargar un costo puntual con 0%', async () => {
    consultas([{ ...fila(idA, 'ARS', '100'), costo: resolverPrecio('ARS', null, cotizacion) }]);
    const criterios = { ...global, seleccion: 'filtrados', proveedorId, marca: 'Marca',
      ajustes: [{ campo: 'costo', modo: 'porcentaje', porcentaje: '0' }] };
    const vista = await vistaPreviaAumento(acceso, criterios);
    expect(vista.filas[0].campos.costo).toMatchObject({ anterior: null, editable: true, motivo: 'Sin costo cargado' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('o.cancelled_at IS NULL'), [
      tenantId, null, 'Marca', proveedorId, [sucursalId],
    ]);
    await expect(aplicarAumento(acceso, {
      ...criterios, version: vista.version, importes: { [idA]: { costo: '75' } },
    })).resolves.toEqual({ actualizados: 1 });
    const [sql, valores] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE public.producto p'))!;
    expect(sql).toContain('costo_reposicion_base = CASE');
    expect(JSON.parse(valores[0])).toEqual([{ id: idA, costo: { ars: '75.00', usd: '0.0750', moneda: 'ARS' } }]);
  });

  it('protege el margen al modificar el costo de stock, incluso al editar manualmente', async () => {
    consultas([{ ...fila(idA, 'ARS', '100'), margen: '20.00' }]);
    const criterios = { ...stock, ajustes: [{ campo: 'costo', modo: 'porcentaje', porcentaje: '10' }] };
    const vista = await vistaPreviaAumento(acceso, criterios);
    expect(vista.filas[0].motivo).toContain('margen minimo');
    await expect(aplicarAumento(acceso, {
      ...criterios, version: vista.version, importes: { [idA]: { costo: '90' } },
    })).rejects.toMatchObject({ code: 'AUMENTO_INVALIDO' });
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(db.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('evalúa juntos el precio y el costo nuevos y aplica únicamente las filas marcadas', async () => {
    consultas([{ ...fila(idA, 'ARS', '100'), margen: '20.00' }, fila(idB, 'ARS', '100')]);
    const criterios = { ...stock, ajustes: [
      { ...ajustePrecio, porcentaje: '20' },
      { campo: 'costo', modo: 'importe', moneda: 'USD', importe: '0.0900' },
    ] };
    const vista = await vistaPreviaAumento(acceso, criterios);
    expect(vista.filas[0]).toMatchObject({
      motivo: null, campos: { precio: { propuesta: '120.00' }, costo: { propuesta: '0.0900', moneda: 'USD', monedaAnterior: 'ARS' } },
    });
    await expect(aplicarAumento(acceso, { ...criterios, version: vista.version, soloIncluidos: [idA] }))
      .resolves.toEqual({ actualizados: 1 });
    const [sql, valores] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE public.producto_sucursal ps'))!;
    expect(sql).toContain('precio_venta_ars = CASE');
    expect(sql).toContain('costo_reposicion = CASE');
    expect(JSON.parse(valores[0])).toEqual([{
      id: idA, precio: { ars: '120.00', usd: '0.1200', moneda: 'ARS' }, costo: { ars: '90.00', usd: '0.0900', moneda: 'USD' },
    }]);
  });

  it('respeta la herencia del precio cuando sí se cambia el costo de esa fila', async () => {
    consultas([{ ...fila(idA, 'ARS', '100'), heredado: true }]);
    const criterios = { ...stock, ajustes: [ajustePrecio, { campo: 'costo', modo: 'porcentaje', porcentaje: '10' }] };
    const vista = await vistaPreviaAumento(acceso, criterios);
    expect(vista.filas[0].campos.precio?.editable).toBe(false);
    await aplicarAumento(acceso, { ...criterios, version: vista.version });
    const [, valores] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE public.producto_sucursal ps'))!;
    expect(JSON.parse(valores[0])).toEqual([{ id: idA, costo: { ars: '88.00', usd: '0.0880', moneda: 'ARS' } }]);
  });
});
