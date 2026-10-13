import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const source = new URL(process.env.DB_URL);
const database = process.env.CAS54_TEST_DATABASE ?? 'casa_segura_cas54_test';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname) || !/^casa_segura_cas54_[a-z0-9_]+$/.test(database)) throw new Error('Solo se verifican bases CAS54 locales aisladas.');
source.pathname = `/${database}`; process.env.DB_URL = source.toString();
const require = createRequire(import.meta.url);
const { pool } = require('../dist/config/db.js');
const { CotizacionService } = require('../dist/services/cotizacion.service.js');
const { ProductoService } = require('../dist/services/producto.service.js');
const { ProductoSucursalService } = require('../dist/services/producto-sucursal.service.js');
const { ListaPreciosService } = require('../dist/services/lista-precios.service.js');
const { ClienteDescuentoRepository } = require('../dist/repositories/cliente-descuento.repository.js');
const { OperacionRepository } = require('../dist/repositories/operacion.repository.js');
const { resolverPrecio } = require('../dist/utils/moneda.js');
const cotizacion = new CotizacionService(), productoService = new ProductoService(), stock = new ProductoSucursalService();
const productos = {
  create: (tenant, data) => productoService.createProducto(data, tenant),
  update: (id, tenant, data) => productoService.updateProducto(id, data, tenant),
  getById: (id, tenant) => productoService.getProducto(id, tenant),
  getPaginatedWithTotal: (...args) => productoService.getPaginatedWithTotal(...args),
};
const tenant = '00000000-0000-0000-0000-000000000001', admin = '00000000-0000-0000-0000-00000000000a', vendedor = '00000000-0000-0000-0000-00000000000c';
const central = '00000000-0000-0000-0000-000000000020', norte = '00000000-0000-0000-0000-000000000021';
const check = async (nombre, ejecutar) => { await ejecutar(); console.log(`OK ${nombre}`); };
try {
  await pool.query('UPDATE public.tenant SET cotizacion_usd_ars = NULL, cotizacion_version = 0, cotizacion_actualizada_at = NULL WHERE id = $1', [tenant]);
  const { rows: originales } = await pool.query('SELECT id, precio_venta_ars, precio_venta_usd, precio_venta_ars_heredado, precio_venta_usd_heredado FROM public.producto_sucursal WHERE NOT precio_referencia_confirmada');
  await check('migración conserva pares anteriores', async () => {
    assert.ok(originales.length > 0);
    for (const fila of originales) { assert.equal(fila.precio_venta_ars, fila.precio_venta_ars_heredado); assert.equal(fila.precio_venta_usd, fila.precio_venta_usd_heredado); }
  });
  const producto = await productos.create(tenant, { codigo: `CAS54-${randomUUID()}`, nombre: 'CAS54 USD preciso' });
  await check('edición no monetaria sin dólar y precio ausente', async () => {
    const editado = await productos.update(producto.id, tenant, { descripcion: 'Se edita sin cotización' });
    assert.equal(editado.precio_resuelto.ars, null);
    assert.equal(editado.contexto_monetario.cotizacion_version, '0');
    const p = await productos.getById(producto.id, tenant); assert.equal(p.precio_resuelto.ars, null);
    await assert.rejects(productos.update(producto.id, tenant, { precio: { moneda_referencia: 'USD', importe_referencia: '100', cotizacion_version: '0' } }), e => e.code === 'COTIZACION_REQUERIDA');
  });
  await check('permiso de administración y conflicto concurrente', async () => {
    await assert.rejects(cotizacion.actualizar(tenant, vendedor, '1000', '0'), e => e.status === 403);
    const resultados = await Promise.allSettled([cotizacion.actualizar(tenant, admin, '1000', '0'), cotizacion.actualizar(tenant, admin, '1200', '0')]);
    assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.find(r => r.status === 'rejected').reason.code, 'COTIZACION_CAMBIO');
  });
  let contexto = await cotizacion.obtener(tenant, admin);
  contexto = await cotizacion.actualizar(tenant, admin, '1000', contexto.cotizacion_version);
  const precio = (moneda, importe) => ({ moneda_referencia: moneda, importe_referencia: importe, cotizacion_version: contexto.cotizacion_version });
  await productos.update(producto.id, tenant, { precio: precio('USD', '0.1234') });
  const a = await stock.create(tenant, { producto_id: producto.id, sucursal_id: central, costo_reposicion: 50000, margen_minimo: 10, descuento: 10, precio: precio('USD', '100') });
  const b = await stock.create(tenant, { producto_id: producto.id, sucursal_id: norte, precio: precio('ARS', '100000') });
  const copia = await pool.query('SELECT precio_base, precio_base_usd FROM public.producto WHERE id = $1', [producto.id]);
  await check('principal USD/ARS independiente y sin UPDATE masivo', async () => {
    contexto = await cotizacion.actualizar(tenant, admin, '1200', contexto.cotizacion_version);
    const actualA = await stock.getById(a.id, tenant), actualB = await stock.getById(b.id, tenant);
    assert.equal(actualA.precio_resuelto.usd, '100.0000'); assert.equal(actualA.precio_resuelto.ars, '120000.00');
    assert.equal(actualB.precio_resuelto.ars, '100000.00'); assert.equal(actualB.precio_resuelto.usd, '83.3333');
    assert.equal(actualA.producto_precio_resuelto.usd, '0.1234');
    assert.deepEqual((await pool.query('SELECT precio_base, precio_base_usd FROM public.producto WHERE id = $1', [producto.id])).rows, copia.rows);
    const detalleEditado = await productos.update(producto.id, tenant, { descripcion: 'El precio no se editó' });
    assert.equal(detalleEditado.precio_resuelto.usd, '0.1234');
    assert.equal(detalleEditado.contexto_monetario.cotizacion_version, contexto.cotizacion_version);
    await assert.rejects(stock.update(a.id, { precio: { moneda_referencia: 'USD', importe_referencia: '200', cotizacion_version: '0' } }, tenant), e => e.status === 409);
    assert.equal((await stock.getById(a.id, tenant)).precio_resuelto.usd, '100.0000');
  });
  await check('precio cero, margen, cantidades y evidencia de adopción', async () => {
    await pool.query('UPDATE public.producto_sucursal SET cantidad_disponible = 42 WHERE id = $1', [a.id]);
    await stock.update(a.id, { precio: precio('USD', '101') }, tenant);
    assert.equal(Number((await stock.getById(a.id, tenant)).cantidad_disponible), 42);
    await assert.rejects(stock.update(a.id, { precio: precio('USD', '1') }, tenant), /margen/);
    await productos.update(producto.id, tenant, { precio: precio('ARS', '0') });
    assert.equal((await productos.getById(producto.id, tenant)).precio_resuelto.ars, '0.00');
    const legado = originales[0];
    if (legado.precio_venta_usd != null) {
      await stock.update(legado.id, { precio: precio('ARS', legado.precio_venta_ars) }, tenant);
      const adoptado = await stock.getById(legado.id, tenant);
      assert.equal(adoptado.precio_referencia_confirmada, true); assert.equal(adoptado.precio_venta_usd_heredado, legado.precio_venta_usd);
    }
  });
  const { rows: clientes } = await pool.query("INSERT INTO public.cliente (tenant_id, nombre) VALUES ($1, 'CAS54 Cliente sin descuento adicional') RETURNING id", [tenant]);
  await stock.update(a.id, { precio: precio('USD', '100') }, tenant);
  await check('lista por cliente ejecuta una cascada y deriva el final USD', async () => {
    const lista = await new ListaPreciosService().obtener(tenant, central, clientes[0].id);
    const item = lista.items.find(i => i.id === a.id);
    assert.equal(item.precioFinalUsd, '90.0000'); assert.equal(item.precioFinalArs, '108000.00'); assert.equal(item.noAlcanzaMargen, false);
    assert.equal(lista.contexto_monetario.cotizacion_version, contexto.cotizacion_version);
    await stock.update(a.id, { descuento: 90 }, tenant);
    const perforado = (await new ListaPreciosService().obtener(tenant, central, clientes[0].id)).items.find(i => i.id === a.id);
    assert.equal(perforado.noAlcanzaMargen, true); assert.ok(Number(perforado.precioFinalArs) >= 55000);
    await stock.update(a.id, { descuento: 10 }, tenant);
  });
  await check('SQL y resolver decimal coinciden', async () => {
    await productos.update(producto.id, tenant, { precio: precio('USD', '0.1234') });
    await pool.query('INSERT INTO public.cliente_descuento_producto (cliente_id, producto_id, porcentaje) VALUES ($1, $2, 0)', [clientes[0].id, producto.id]);
    for (const [moneda, importe] of [['USD', '0.1234'], ['USD', '0.0001'], ['ARS', '100000'], ['ARS', '0']]) {
      const { rows } = await pool.query('SELECT public.catalogo_resolver_precio($1,$2,$3,$4) AS precio', [moneda, moneda === 'ARS' ? importe : null, moneda === 'USD' ? importe : null, contexto.cotizacion_usd_ars]);
      const ts = resolverPrecio(moneda, importe, contexto);
      assert.equal(Number(rows[0].precio.ars), Number(ts.ars)); assert.equal(Number(rows[0].precio.usd), Number(ts.usd));
    }
  });
  await check('orden monetario antes de paginar, nulos al final', async () => {
    const ordenados = await productos.getPaginatedWithTotal(tenant, 1000, 0, undefined, undefined, 'precioBaseArs', 'asc');
    let anterior = -1, nulo = false;
    for (const item of ordenados.items) { if (item.precio_resuelto.ars === null) nulo = true; else { assert.equal(nulo, false); assert.ok(Number(item.precio_resuelto.ars) >= anterior); anterior = Number(item.precio_resuelto.ars); } }
  });
  await check('confirmación ARS rechaza cotización anterior y USD sin versión', async () => {
    const repo = new OperacionRepository();
    const operacion = { tipo: 'Venta', sucursal_id: central, registrar_finanzas_ahora: false, impactar_stock_ahora: false, items: [{ producto_sucursal_id: a.id, cantidad: 1, precio_unit_ars: 120000 }], venta: { total_ars: 120000 } };
    await assert.rejects(repo.crear(tenant, admin, { ...operacion, cotizacion_version_catalogo: '0' }), e => e.status === 409);
    await assert.rejects(repo.crear(tenant, admin, operacion), e => e.code === 'COTIZACION_REQUERIDA');
    const venta = await repo.crear(tenant, admin, { ...operacion, cotizacion_version_catalogo: contexto.cotizacion_version });
    contexto = await cotizacion.actualizar(tenant, admin, '1300', contexto.cotizacion_version);
    const historica = await repo.findById(tenant, venta.id); assert.equal(Number(historica.venta_total_ars), 120000);
  });
  await check('configuración de descuentos muestra ARS vigente del principal USD', async () => {
    const descuentos = await new ClienteDescuentoRepository().findProductosByCliente(clientes[0].id, tenant);
    assert.equal(descuentos[0].producto_precio_base, '160.42');
  });
  await check('aislamiento API, RLS de vistas y bloqueo directo de cotización', async () => {
    const { rows: tenants } = await pool.query("INSERT INTO public.tenant (nombre_empresa) VALUES ('CAS54 Empresa B') RETURNING id");
    const otroTenant = tenants[0].id;
    assert.equal(await productos.getById(producto.id, otroTenant), null);
    assert.equal(await stock.getById(a.id, otroTenant), null);
    await assert.rejects(new ListaPreciosService().obtener(otroTenant, central, clientes[0].id), e => e.status === 404);
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [admin]);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM public.tenant WHERE id = $1', [otroTenant])).rows[0].n, 0);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM public.producto_catalogo WHERE tenant_id = $1', [otroTenant])).rows[0].n, 0);
      await assert.rejects(client.query('UPDATE public.tenant SET cotizacion_usd_ars = 1 WHERE id = $1', [tenant]), e => e.code === '42501');
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  console.log('CAS54: integración local completa.');
} finally { await pool.end(); }
