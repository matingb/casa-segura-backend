import Decimal from 'decimal.js';
import { CatalogoError } from './errors';

export const Dinero = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Moneda = 'ARS' | 'USD';
export interface ContextoMonetario {
  cotizacion_usd_ars: string | null;
  cotizacion_version: string;
  actualizada_at: string | null;
  actualizada_por?: string | null;
  actualizada_por_nombre?: string | null;
}
export interface PrecioInput {
  moneda_referencia: Moneda;
  importe_referencia: string | null;
  cotizacion_version: string;
}
export interface PrecioResuelto {
  moneda_referencia: Moneda;
  importe_referencia: string | null;
  ars: string | null;
  usd: string | null;
  estado: 'VINCULADO' | 'SIN_PRECIO' | 'SIN_COTIZACION' | 'LEGADO_PENDIENTE_REVISION';
}

export function decimalValido(value: unknown, campo: string, escala: number, enteros: number, positivo = false): Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new CatalogoError(`${campo} debe ser un importe decimal válido.`, 'IMPORTE_INVALIDO');
  }
  const texto = String(value);
  if (!/^\d+(\.\d+)?$/.test(texto)) {
    throw new CatalogoError(`${campo} debe ser un importe decimal no negativo.`, 'IMPORTE_INVALIDO');
  }
  const importe = new Dinero(texto);
  if (!importe.isFinite() || importe.lt(0) || (positivo && importe.lte(0)) || importe.decimalPlaces() > escala || importe.gte(new Dinero(10).pow(enteros))) {
    throw new CatalogoError(`${campo} está fuera de rango o tiene más de ${escala} decimales.`, 'IMPORTE_INVALIDO');
  }
  return importe;
}

export function resolverPrecio(moneda: Moneda, principal: Decimal.Value | null, contexto: ContextoMonetario): PrecioResuelto {
  if (principal == null) return { moneda_referencia: moneda, importe_referencia: null, ars: null, usd: null, estado: 'SIN_PRECIO' };
  const importe = new Dinero(principal);
  const tasa = contexto.cotizacion_usd_ars == null ? null : new Dinero(contexto.cotizacion_usd_ars);
  if (tasa && (!tasa.isFinite() || tasa.lte(0))) throw new CatalogoError('Configurá un valor del dólar válido.', 'COTIZACION_REQUERIDA');
  return {
    moneda_referencia: moneda,
    importe_referencia: importe.toFixed(moneda === 'ARS' ? 2 : 4),
    ars: moneda === 'ARS' ? importe.toFixed(2) : tasa ? importe.mul(tasa).toFixed(2) : null,
    usd: moneda === 'USD' ? importe.toFixed(4) : tasa ? importe.div(tasa).toFixed(4) : null,
    estado: tasa ? 'VINCULADO' : 'SIN_COTIZACION',
  };
}

export function prepararPrecio(input: PrecioInput | null, contexto: ContextoMonetario): PrecioResuelto {
  if (input === null) return resolverPrecio('ARS', null, contexto);
  if (!input || !['ARS', 'USD'].includes(input.moneda_referencia)) {
    throw new CatalogoError('Elegí ARS o USD como moneda de referencia.', 'MONEDA_INVALIDA');
  }
  if (!contexto.cotizacion_usd_ars) throw new CatalogoError('Configurá el valor del dólar para calcular el precio.', 'COTIZACION_REQUERIDA');
  if (typeof input.cotizacion_version !== 'string' || input.cotizacion_version !== contexto.cotizacion_version) {
    throw new CatalogoError('Cambió el valor del dólar. Revisá el equivalente y confirmá la nueva cotización.', 'COTIZACION_CAMBIO', 409);
  }
  if (input.importe_referencia === null) return resolverPrecio(input.moneda_referencia, null, contexto);
  const moneda = input.moneda_referencia;
  const principal = decimalValido(input.importe_referencia, 'El precio', moneda === 'ARS' ? 2 : 4, moneda === 'ARS' ? 12 : 10);
  const precio = resolverPrecio(moneda, principal, contexto);
  if (precio.ars) decimalValido(precio.ars, 'El equivalente ARS', 2, 12);
  if (precio.usd) decimalValido(precio.usd, 'El equivalente USD', 4, 10);
  return precio;
}

/**
 * Costo de reposición con moneda de referencia. A diferencia del precio, un
 * principal ARS no depende del dólar: se puede guardar sin cotización y sin
 * confirmar versión. Un principal USD exige la cotización que el usuario vio.
 */
export function prepararCosto(input: PrecioInput | null, contexto: ContextoMonetario): PrecioResuelto {
  if (input === null) return resolverPrecio('ARS', null, contexto);
  if (!input || !['ARS', 'USD'].includes(input.moneda_referencia)) {
    throw new CatalogoError('Elegí ARS o USD como moneda del costo de reposición.', 'MONEDA_INVALIDA');
  }
  const moneda = input.moneda_referencia;
  if (input.importe_referencia === null) return resolverPrecio(moneda, null, contexto);
  if (moneda === 'USD') {
    if (!contexto.cotizacion_usd_ars) throw new CatalogoError('Configurá el valor del dólar para cargar un costo en USD.', 'COTIZACION_REQUERIDA');
    if (typeof input.cotizacion_version !== 'string' || input.cotizacion_version !== contexto.cotizacion_version) {
      throw new CatalogoError('Cambió el valor del dólar. Revisá el equivalente del costo y confirmá la nueva cotización.', 'COTIZACION_CAMBIO', 409);
    }
  }
  const principal = decimalValido(input.importe_referencia, 'El costo de reposición', moneda === 'ARS' ? 2 : 4, moneda === 'ARS' ? 12 : 10);
  const costo = resolverPrecio(moneda, principal, contexto);
  if (costo.ars) decimalValido(costo.ars, 'El equivalente ARS del costo', 2, 12);
  if (costo.usd) decimalValido(costo.usd, 'El equivalente USD del costo', 4, 10);
  return costo;
}

/** Costo en ARS con la cotización vigente, a partir de las columnas guardadas. */
export function costoArsVigente(moneda: unknown, ars: Decimal.Value | null, usd: Decimal.Value | null, contexto: ContextoMonetario): string | null {
  if (moneda !== 'USD') return ars == null ? null : new Dinero(ars).toFixed(2);
  if (usd == null) return null;
  if (!contexto.cotizacion_usd_ars) throw new CatalogoError('Configurá el valor del dólar para evaluar costos en USD.', 'COTIZACION_REQUERIDA');
  return new Dinero(usd).mul(contexto.cotizacion_usd_ars).toFixed(2);
}
