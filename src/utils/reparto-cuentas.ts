import { BusinessError } from './errors';

/** Tolerancia en pesos para diferencias de redondeo al validar que el reparto cierre. */
const TOLERANCIA = 0.01;

export type ModoReparto = 'porcentaje' | 'monto';

/** Cuenta tal como llega desde el cliente, antes de resolver los cálculos. */
export interface CuentaRepartoInput {
  cuenta_financiera_id: string;
  /** Requerido en modo 'porcentaje': qué % de la base va a esta cuenta. */
  porcentaje_venta?: number | null;
  /** Requerido en modo 'monto': lo que cobra la cuenta, con recargo ya incluido. */
  monto_ars?: number | null;
  monto_usd?: number | null;
}

/** Cuenta con todos los valores ya resueltos, lista para persistir. */
export interface CuentaRepartoResuelta {
  cuenta_financiera_id: string;
  /** % de la base asignado a esta cuenta. */
  porcentaje_venta: number;
  /** Recargo de la cuenta, tomado de cuenta_financiera (no del input). */
  porcentaje_extra: number;
  /** Parte de la base que cubre esta cuenta, sin recargo. */
  base_ars: number;
  /** Lo que efectivamente entra/sale de la cuenta, con recargo aplicado. */
  monto_ars: number;
  monto_usd: number | null;
}

export interface ResultadoReparto {
  cuentas: CuentaRepartoResuelta[];
  /** Suma de las bases: debe coincidir con el subtotal de la operación. */
  subtotalBase: number;
  /** Suma de los recargos aplicados. */
  totalRecargos: number;
  /** Total real de la operación: subtotalBase + totalRecargos. */
  total: number;
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Reparto por porcentaje: el usuario define qué % de la base va a cada cuenta.
 * El monto que cobra cada cuenta se calcula aplicando su recargo sobre esa parte.
 *
 *   base_cuenta  = subtotalBase * (porcentaje / 100)
 *   monto_cuenta = base_cuenta * (1 + extra / 100)
 */
export function calcularRepartoPorPorcentaje(
  subtotalBase: number,
  cuentas: CuentaRepartoInput[],
  extraPorCuenta: Map<string, number>
): ResultadoReparto {
  const sumaPorcentajes = cuentas.reduce((acc, c) => acc + Number(c.porcentaje_venta ?? 0), 0);
  if (Math.abs(sumaPorcentajes - 100) > TOLERANCIA) {
    throw new BusinessError(
      `Los porcentajes de las cuentas deben sumar 100%. Suman ${sumaPorcentajes.toFixed(2)}%.`
    );
  }

  const resueltas = cuentas.map((c) => {
    const porcentaje = Number(c.porcentaje_venta ?? 0);
    const extra = extraPorCuenta.get(c.cuenta_financiera_id) ?? 0;
    const base = redondear(subtotalBase * (porcentaje / 100));
    const monto = redondear(base * (1 + extra / 100));
    return {
      cuenta_financiera_id: c.cuenta_financiera_id,
      porcentaje_venta: porcentaje,
      porcentaje_extra: extra,
      base_ars: base,
      monto_ars: monto,
      monto_usd: c.monto_usd ?? null,
    };
  });

  return armarResultado(resueltas);
}

/**
 * Reparto por monto: el usuario define cuánto cobra cada cuenta, con el recargo
 * ya incluido. De ahí se deriva la parte de la base que cubre y su porcentaje.
 *
 *   base_cuenta = monto_cuenta / (1 + extra / 100)
 *
 * La suma de las bases debe coincidir con el subtotal de la operación.
 */
export function calcularRepartoPorMonto(
  subtotalBase: number,
  cuentas: CuentaRepartoInput[],
  extraPorCuenta: Map<string, number>
): ResultadoReparto {
  const conBase = cuentas.map((c) => {
    const monto = Number(c.monto_ars ?? 0);
    const extra = extraPorCuenta.get(c.cuenta_financiera_id) ?? 0;
    const base = redondear(monto / (1 + extra / 100));
    return { input: c, monto: redondear(monto), extra, base };
  });

  const sumaBases = redondear(conBase.reduce((acc, c) => acc + c.base, 0));
  if (Math.abs(sumaBases - subtotalBase) > TOLERANCIA) {
    throw new BusinessError(
      `Los montos de las cuentas no cubren el total de la operación. ` +
      `Cubren $${sumaBases.toFixed(2)} sobre $${subtotalBase.toFixed(2)}.`
    );
  }

  const resueltas = conBase.map((c) => ({
    cuenta_financiera_id: c.input.cuenta_financiera_id,
    porcentaje_venta: subtotalBase > 0 ? redondear((c.base / subtotalBase) * 100) : 0,
    porcentaje_extra: c.extra,
    base_ars: c.base,
    monto_ars: c.monto,
    monto_usd: c.input.monto_usd ?? null,
  }));

  return armarResultado(resueltas);
}

function armarResultado(cuentas: CuentaRepartoResuelta[]): ResultadoReparto {
  const subtotalBase = redondear(cuentas.reduce((acc, c) => acc + c.base_ars, 0));
  const total = redondear(cuentas.reduce((acc, c) => acc + c.monto_ars, 0));
  return {
    cuentas,
    subtotalBase,
    totalRecargos: redondear(total - subtotalBase),
    total,
  };
}

/**
 * Punto de entrada único: resuelve el reparto según el modo elegido.
 * `extraPorCuenta` debe venir de la base de datos, nunca del cliente.
 */
export function resolverReparto(
  modo: ModoReparto,
  subtotalBase: number,
  cuentas: CuentaRepartoInput[],
  extraPorCuenta: Map<string, number>
): ResultadoReparto {
  return modo === 'porcentaje'
    ? calcularRepartoPorPorcentaje(subtotalBase, cuentas, extraPorCuenta)
    : calcularRepartoPorMonto(subtotalBase, cuentas, extraPorCuenta);
}
