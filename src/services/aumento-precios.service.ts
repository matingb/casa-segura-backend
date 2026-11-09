import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/db';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { BusinessError, CatalogoError } from '../utils/errors';
import { ContextoMonetario, Dinero, Moneda, PrecioResuelto, decimalValido, prepararCosto, prepararPrecio } from '../utils/moneda';
import { columnasMonto } from './precio-catalogo.service';
import { margenEntre } from './producto-sucursal.service';
import { SucursalAlcance, exigirSucursal } from './sucursal-alcance.service';

const CAMPOS = ['precio', 'costo'] as const;
type Campo = (typeof CAMPOS)[number];
type Ajuste =
  | { campo: Campo; modo: 'porcentaje'; porcentaje: string }
  | { campo: Campo; modo: 'importe'; moneda: Moneda; importe: string };
type Importes = Partial<Record<Campo, string>>;
type Montos = Partial<Record<Campo, ReturnType<typeof columnasMonto>>>;

interface Criterios {
  alcance: 'productos' | 'stock';
  ajustes: Ajuste[];
  sucursalId: string | null;
  categoriaId: string | null;
  marca: string | null;
  proveedorId: string | null;
  incluirHeredados: boolean;
}

interface Fila {
  id: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  precio: PrecioResuelto;
  heredado: boolean;
  costo: PrecioResuelto;
  margen: string | null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function datosInvalidos(mensaje: string): never {
  throw new CatalogoError(mensaje, 'AUMENTO_INVALIDO');
}

function esCampo(valor: unknown): valor is Campo {
  return CAMPOS.some((campo) => campo === valor);
}

function leerAjustes(datos: unknown): Ajuste[] {
  if (!Array.isArray(datos) || !datos.length || datos.length > CAMPOS.length) {
    datosInvalidos('Elegí al menos un campo para editar.');
  }
  const vistos = new Set<Campo>();
  return datos.map((ajuste) => {
    const { campo, modo, porcentaje, importe, moneda } = ajuste ?? {};
    if (!esCampo(campo) || vistos.has(campo)) datosInvalidos('Elegí campos válidos y distintos.');
    vistos.add(campo);
    if (modo === 'porcentaje') {
      return { campo, modo, porcentaje: decimalValido(porcentaje, 'El porcentaje', 2, 4).toString() };
    }
    if (modo === 'importe' && (moneda === 'ARS' || moneda === 'USD')) {
      const valor = decimalValido(importe, 'El importe', moneda === 'ARS' ? 2 : 4, moneda === 'ARS' ? 12 : 10);
      return { campo, modo, moneda, importe: valor.toString() };
    }
    return datosInvalidos('Elegí cómo querés editar cada campo.');
  });
}

function leerCriterios(body: Record<string, unknown>, acceso: SucursalAlcance): Criterios {
  const { alcance, sucursalId, seleccion, categoriaId, marca, proveedorId, incluirHeredados } = body;
  if (alcance !== 'productos' && alcance !== 'stock') datosInvalidos('Elegí el alcance del aumento.');
  const ajustes = leerAjustes(body.ajustes);
  if (alcance === 'stock') {
    if (typeof sucursalId !== 'string' || !uuid.test(sucursalId)) datosInvalidos('Elegí una sucursal.');
    exigirSucursal(acceso, sucursalId, true);
  }
  if (seleccion !== 'todos' && seleccion !== 'filtrados') datosInvalidos('Elegí qué productos querés incluir.');
  if (seleccion === 'filtrados') {
    if (categoriaId != null && (typeof categoriaId !== 'string' || !uuid.test(categoriaId))) {
      datosInvalidos('Elegí una categoría válida.');
    }
    if (marca != null && (typeof marca !== 'string' || marca.length > 100)) datosInvalidos('Elegí una marca válida.');
    if (proveedorId != null && (typeof proveedorId !== 'string' || !uuid.test(proveedorId))) {
      datosInvalidos('Elegí un proveedor válido.');
    }
    if (!categoriaId && !marca && !proveedorId) datosInvalidos('Elegí al menos una categoría, una marca o un proveedor.');
  }
  return {
    alcance,
    ajustes,
    sucursalId: alcance === 'stock' ? sucursalId as string : null,
    categoriaId: seleccion === 'filtrados' ? (categoriaId as string | null | undefined) ?? null : null,
    marca: seleccion === 'filtrados' && marca ? marca as string : null,
    proveedorId: seleccion === 'filtrados' ? (proveedorId as string | null | undefined) ?? null : null,
    incluirHeredados: alcance === 'stock' && ajustes.some(({ campo }) => campo === 'precio') && incluirHeredados === true,
  };
}

async function leerCatalogo(acceso: SucursalAlcance, criterios: Criterios, client?: PoolClient) {
  const { tenantId } = acceso;
  const { sucursalId, categoriaId, marca, proveedorId } = criterios;
  const db = client ?? pool;
  const cotizaciones = new CotizacionRepository();
  const contexto = sucursalId
    ? await cotizaciones.obtenerPorSucursal(tenantId, sucursalId, client)
    : await cotizaciones.obtener(tenantId, client);
  const filtros = `p.tenant_id = $1 AND p.deleted_at IS NULL
    AND ($2::uuid IS NULL OR st.tipo_id = $2)
    AND ($3::text IS NULL OR p.marca = $3)
    AND ($4::uuid IS NULL OR EXISTS (
      SELECT 1 FROM public.compra co
      JOIN public.proveedor pr ON pr.id = co.proveedor_id AND pr.tenant_id = $1
      JOIN public.operacion o ON o.id = co.operacion_id AND o.tenant_id = $1 AND o.cancelled_at IS NULL
      JOIN public.usuario_sucursal us ON us.id = o.usuario_sucursal_id AND us.sucursal_id = ANY($5::uuid[])
      JOIN public.operacion_detalle od ON od.operacion_id = o.id
      JOIN public.producto_sucursal historial ON historial.id = od.producto_sucursal_id AND historial.sucursal_id = us.sucursal_id
      WHERE co.proveedor_id = $4 AND historial.producto_id = p.id
    ))`;
  const params = [tenantId, categoriaId, marca, proveedorId, sucursalId ? [sucursalId] : acceso.sucursalIds];
  const { rows } = sucursalId
    ? await db.query<Fila>(
      `SELECT ps.id, p.codigo, p.nombre, p.marca, c.precio_resuelto AS precio,
              c.precio_desde_producto AS heredado, c.costo_reposicion_resuelto AS costo, c.margen_minimo AS margen
       FROM public.producto p
       LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
       JOIN public.producto_sucursal ps ON ps.producto_id = p.id
       JOIN public.producto_sucursal_catalogo c ON c.id = ps.id
       WHERE ${filtros} AND ps.sucursal_id = $6 AND ps.deleted_at IS NULL
       ORDER BY p.id, ps.id
       ${client ? 'FOR SHARE OF p FOR UPDATE OF ps' : ''}`,
      [...params, sucursalId])
    : await db.query<Fila>(
      `SELECT p.id, p.codigo, p.nombre, p.marca, c.precio_resuelto AS precio,
              FALSE AS heredado, c.costo_reposicion_base_resuelto AS costo, NULL AS margen
       FROM public.producto p
       LEFT JOIN public.subtipo st ON st.id = p.subtipo_id
       JOIN public.producto_catalogo c ON c.id = p.id
       WHERE ${filtros}
       ORDER BY p.id
       ${client ? 'FOR UPDATE OF p' : ''}`,
      params);

  const version = createHash('sha256')
    .update(JSON.stringify([tenantId, criterios, contexto.cotizacion_version, rows]))
    .digest('hex');
  return { rows, contexto, version };
}

function motivoNoEditable(fila: Fila, ajuste: Ajuste, moneda: Moneda, incluirHeredados: boolean, contexto: ContextoMonetario) {
  if (ajuste.campo === 'precio') {
    if (fila.precio.importe_referencia === null && ajuste.modo === 'porcentaje') return 'Sin precio';
    if (fila.precio.estado === 'LEGADO_PENDIENTE_REVISION') return 'Precio pendiente de revisión';
    if (fila.heredado && fila.precio.importe_referencia !== null && !incluirHeredados) return 'Precio heredado';
  }
  if (!contexto.cotizacion_usd_ars && (ajuste.campo === 'precio' || moneda === 'USD')) {
    return 'Falta configurar la cotización';
  }
  return null;
}

function calcularPropuesta(actual: PrecioResuelto, ajuste: Ajuste, moneda: Moneda) {
  const escala = moneda === 'USD' ? 4 : 2;
  if (ajuste.modo === 'importe') return new Dinero(ajuste.importe).toFixed(escala);
  if (actual.importe_referencia === null) return null;
  const factor = new Dinero(ajuste.porcentaje).div(100).plus(1);
  return new Dinero(actual.importe_referencia).mul(factor).toFixed(escala);
}

function resolverCampo(fila: Fila, ajuste: Ajuste, criterios: Criterios, contexto: ContextoMonetario, manual?: string) {
  const actual = fila[ajuste.campo];
  const anterior = actual.importe_referencia;
  const monedaAnterior = actual.moneda_referencia;
  const moneda = ajuste.modo === 'importe' ? ajuste.moneda : monedaAnterior;
  const heredado = ajuste.campo === 'precio' && fila.heredado && anterior !== null;
  const datos = { anterior, monedaAnterior, moneda, heredado };
  const bloqueo = motivoNoEditable(fila, ajuste, moneda, criterios.incluirHeredados, contexto);
  if (bloqueo) return { ...datos, editable: false, propuesta: null, motivo: bloqueo, cambio: null };
  const propuesta = manual ?? calcularPropuesta(actual, ajuste, moneda);
  if (propuesta === null) return { ...datos, editable: true, propuesta, motivo: 'Sin costo cargado', cambio: null };
  try {
    const preparar = ajuste.campo === 'precio' ? prepararPrecio : prepararCosto;
    const resuelto = preparar({ moneda_referencia: moneda, importe_referencia: propuesta,
      cotizacion_version: contexto.cotizacion_version }, contexto);
    const cambia = moneda !== monedaAnterior || anterior === null || !new Dinero(resuelto.importe_referencia!).eq(anterior);
    return { ...datos, editable: true, propuesta, motivo: cambia ? null : 'Sin cambio', cambio: cambia ? columnasMonto(resuelto) : null };
  } catch (error) {
    if (!(error instanceof BusinessError)) throw error;
    if (manual !== undefined) throw error;
    return { ...datos, editable: true, propuesta, motivo: error.message, cambio: null };
  }
}

function resolverFila(fila: Fila, criterios: Criterios, contexto: ContextoMonetario, manual: Importes = {}) {
  const campos: Partial<Record<Campo, Omit<ReturnType<typeof resolverCampo>, 'cambio'>>> = {};
  const cambios: Montos = {};
  for (const ajuste of criterios.ajustes) {
    const { campo } = ajuste;
    const { cambio, ...vista } = resolverCampo(fila, ajuste, criterios, contexto, manual[campo]);
    campos[campo] = vista;
    if (cambio) cambios[campo] = cambio;
  }

  // El margen se verifica contra el precio y el costo finales del mismo producto.
  let motivo: string | null = null;
  if (fila.margen !== null && (cambios.precio || cambios.costo)) {
    try {
      margenEntre(cambios.costo ?? columnasMonto(fila.costo), cambios.precio ?? columnasMonto(fila.precio), fila.margen);
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
      if (Object.keys(manual).length) throw error;
      motivo = error.message;
    }
  }
  return { campos, motivo, cambios: motivo ? {} : cambios };
}

export async function vistaPreviaAumento(acceso: SucursalAlcance, body: Record<string, unknown>) {
  const criterios = leerCriterios(body, acceso);
  const { rows, contexto, version } = await leerCatalogo(acceso, criterios);
  const ordenarCodigo = new Intl.Collator('es-AR', { numeric: true });
  const filas = rows.map((fila) => {
    const { id, codigo, nombre, marca } = fila;
    const { campos, motivo } = resolverFila(fila, criterios, contexto);
    return { id, codigo, nombre, marca, campos, motivo };
  });
  return { version, filas: filas.sort((a, b) => ordenarCodigo.compare(a.codigo, b.codigo)) };
}

function leerExcepciones(body: Record<string, unknown>, ajustes: Ajuste[]) {
  const { excluidos = [], soloIncluidos = null, importes = {} } = body;
  if (!Array.isArray(excluidos) || excluidos.some((id) => typeof id !== 'string' || !uuid.test(id))) {
    datosInvalidos('La selección de productos no es válida.');
  }
  if (soloIncluidos !== null && (excluidos.length || !Array.isArray(soloIncluidos)
    || soloIncluidos.some((id) => typeof id !== 'string' || !uuid.test(id)))) {
    datosInvalidos('La selección de productos no es válida.');
  }
  if (!importes || typeof importes !== 'object' || Array.isArray(importes)) datosInvalidos('Los importes editados no son válidos.');
  const cambios = new Map<string, Importes>();
  for (const [id, valores] of Object.entries(importes)) {
    if (!uuid.test(id) || !valores || typeof valores !== 'object' || Array.isArray(valores)) {
      datosInvalidos('Los importes editados no son válidos.');
    }
    const porCampo: Importes = {};
    for (const [campo, valor] of Object.entries(valores)) {
      if (!esCampo(campo) || !ajustes.some((ajuste) => ajuste.campo === campo) || typeof valor !== 'string') {
        datosInvalidos('Los importes editados no son válidos.');
      }
      porCampo[campo] = valor;
    }
    cambios.set(id, porCampo);
  }
  return { excluidos: new Set<string>(excluidos), incluidos: soloIncluidos === null ? null : new Set<string>(soloIncluidos), importes: cambios };
}

const columnasPorCampo = {
  precio: { stock: ['precio_venta_ars', 'precio_venta_usd', 'moneda_precio_venta'],
    producto: ['precio_base', 'precio_base_usd', 'moneda_precio_base'] },
  costo: { stock: ['costo_reposicion', 'costo_reposicion_usd', 'moneda_costo_reposicion'],
    producto: ['costo_reposicion_base', 'costo_reposicion_base_usd', 'moneda_costo_reposicion_base'] },
};

function asignaciones(ajustes: Ajuste[], stock: boolean) {
  const tabla = stock ? 'ps' : 'p';
  return ajustes.flatMap(({ campo }) => {
    const [ars, usd, moneda] = columnasPorCampo[campo][stock ? 'stock' : 'producto'];
    const dato = `cambio.${campo}`;
    const columnas = [
      `${ars} = CASE WHEN ${dato} IS NULL THEN ${tabla}.${ars} ELSE (${dato}->>'ars')::numeric END`,
      `${usd} = CASE WHEN ${dato} IS NULL THEN ${tabla}.${usd} ELSE (${dato}->>'usd')::numeric END`,
      `${moneda} = COALESCE(${dato}->>'moneda', ${tabla}.${moneda})`,
    ];
    if (stock && campo === 'precio') columnas.push('precio_referencia_confirmada = cambio.precio IS NOT NULL OR ps.precio_referencia_confirmada');
    return columnas;
  }).join(', ');
}

export async function aplicarAumento(acceso: SucursalAlcance, body: Record<string, unknown>) {
  const criterios = leerCriterios(body, acceso);
  const { excluidos, incluidos, importes } = leerExcepciones(body, criterios.ajustes);
  if (typeof body.version !== 'string' || !/^[0-9a-f]{64}$/.test(body.version)) {
    datosInvalidos('Calculá la vista previa antes de aplicar los cambios.');
  }
  const desactualizado = () => new CatalogoError(
    'Cambió el catálogo o la cotización. Volvé a revisar la vista previa antes de aplicar los cambios.',
    'AUMENTO_DESACTUALIZADO', 409,
  );

  try {
    return await withTransaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const { rows, contexto, version } = await leerCatalogo(acceso, criterios, client);
      if (body.version !== version) throw desactualizado();
      const cambios = [];
      for (const fila of rows) {
        if (excluidos.has(fila.id) || (incluidos && !incluidos.has(fila.id))) continue;
        try {
          const { cambios: montos } = resolverFila(fila, criterios, contexto, importes.get(fila.id));
          if (montos.precio || montos.costo) cambios.push({ id: fila.id, ...montos });
        } catch (error) {
          if (!(error instanceof BusinessError)) throw error;
          datosInvalidos(`${fila.codigo} · ${fila.nombre}. ${error.message}`);
        }
      }
      if (!cambios.length) datosInvalidos('No hay importes seleccionados para actualizar.');

      const valores = 'jsonb_to_recordset($1::jsonb) AS cambio(id uuid, precio jsonb, costo jsonb)';
      const campos = asignaciones(criterios.ajustes, Boolean(criterios.sucursalId));
      const resultado = criterios.sucursalId
        ? await client.query(
          `UPDATE public.producto_sucursal ps
           SET ${campos}
           FROM ${valores}, public.producto p
           WHERE ps.id = cambio.id AND ps.sucursal_id = $3 AND ps.producto_id = p.id
             AND p.tenant_id = $2 AND p.deleted_at IS NULL AND ps.deleted_at IS NULL`,
          [JSON.stringify(cambios), acceso.tenantId, criterios.sucursalId])
        : await client.query(
          `UPDATE public.producto p
           SET ${campos}, updated_at = NOW()
           FROM ${valores}
           WHERE p.id = cambio.id AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
          [JSON.stringify(cambios), acceso.tenantId]);
      if (resultado.rowCount !== cambios.length) throw desactualizado();
      return { actualizados: cambios.length };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['40001', '40P01'].includes(String(error.code))) {
      throw desactualizado();
    }
    throw error;
  }
}
