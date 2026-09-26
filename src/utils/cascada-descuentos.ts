/**
 * Cascada de descuentos para las listas de precios.
 *
 * Los tres primeros niveles se aplican en cascada: cada uno sobre el precio que
 * dejó el anterior (10% + 10% + 10% da 27,1%, no 30%). El descuento del cliente
 * es distinto: se suma en puntos porcentuales al descuento efectivo acumulado.
 *
 *   1. sucursal   (el "geográfico" del pedido original)
 *   2. categoría / subcategoría — la subcategoría pisa a la categoría
 *   3. producto   — el de la sucursal pisa al general del producto
 *   4. cliente    — se SUMA, no compone
 *
 * El margen mínimo del producto topea el resultado: si la cascada deja el precio
 * por debajo del piso, se recorta al piso y se marca el renglón.
 */

export type NivelDescuento = 'sucursal' | 'categoria' | 'producto' | 'cliente';

export interface AporteNivel {
  nivel: NivelDescuento;
  /** Porcentaje configurado en ese nivel. */
  porcentaje: number;
  /** Precio que queda después de aplicarlo (para los niveles en cascada). */
  precioResultante: number;
}

export interface EntradaCascada {
  precioBase: number;
  descuentoSucursal?: number | null;
  descuentoCategoria?: number | null;
  descuentoProducto?: number | null;
  descuentoCliente?: number | null;
  /** Piso de rentabilidad: costo × (1 + margen/100). Null = sin tope. */
  costoReposicion?: number | null;
  margenMinimo?: number | null;
}

export interface ResultadoCascada {
  precioBase: number;
  /** Precio final, ya topeado por margen mínimo si correspondía. */
  precioFinal: number;
  /** Precio que habría salido de la cascada sin aplicar el tope. */
  precioSinTope: number;
  /** Descuento efectivo final sobre el precio base, en porcentaje. */
  descuentoEfectivo: number;
  /** Aportes de cada nivel, en orden de aplicación. */
  aportes: AporteNivel[];
  /** Piso de precio por margen mínimo, o null si no se pudo calcular. */
  precioMinimo: number | null;
  /** true si la cascada perforó el margen y hubo que recortar. */
  topeAplicado: boolean;
  /**
   * Descuento máximo que admite el producto sin perforar el margen.
   * Es lo que el pedido original pide mostrar en la asignación por producto.
   */
  descuentoMaximo: number | null;
}

function normalizarPorcentaje(valor: number | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Piso de precio que impone el margen mínimo. Devuelve null cuando no se puede
 * calcular (sin costo o sin margen cargados), que es el mismo criterio que usa
 * la validación de ventas.
 */
export function calcularPrecioMinimo(
  costoReposicion: number | null | undefined,
  margenMinimo: number | null | undefined
): number | null {
  if (costoReposicion === null || costoReposicion === undefined) return null;
  if (margenMinimo === null || margenMinimo === undefined) return null;
  const costo = Number(costoReposicion);
  const margen = Number(margenMinimo);
  if (!Number.isFinite(costo) || !Number.isFinite(margen) || costo <= 0) return null;
  return redondear(costo * (1 + margen / 100));
}

/**
 * Descuento máximo aplicable sin perforar el margen mínimo, en porcentaje.
 * Null cuando no hay piso calculable; 0 cuando el precio ya está en el piso.
 */
export function calcularDescuentoMaximo(
  precioBase: number,
  precioMinimo: number | null
): number | null {
  if (precioMinimo === null) return null;
  if (!Number.isFinite(precioBase) || precioBase <= 0) return null;
  if (precioMinimo >= precioBase) return 0;
  return redondear((1 - precioMinimo / precioBase) * 100);
}

/**
 * Nivel 3: el descuento cargado para el producto en esa sucursal pisa al
 * descuento general del producto. Un 0 explícito en la sucursal es un
 * descuento válido y no delega; solo `null` (no definido) cae al general.
 *
 * Mismo criterio que usa la categoría con sus excepciones por sucursal.
 */
export function resolverDescuentoProducto(
  descuentoEnSucursal: number | null | undefined,
  descuentoBase: number | null | undefined
): { porcentaje: number | null; origen: 'sucursal' | 'producto' | 'sin-descuento' } {
  if (descuentoEnSucursal !== null && descuentoEnSucursal !== undefined) {
    return { porcentaje: Number(descuentoEnSucursal), origen: 'sucursal' };
  }
  if (descuentoBase !== null && descuentoBase !== undefined) {
    return { porcentaje: Number(descuentoBase), origen: 'producto' };
  }
  return { porcentaje: null, origen: 'sin-descuento' };
}

export function calcularCascada(entrada: EntradaCascada): ResultadoCascada {
  const precioBase = Number(entrada.precioBase);
  const aportes: AporteNivel[] = [];

  const precioMinimo = calcularPrecioMinimo(entrada.costoReposicion, entrada.margenMinimo);
  const descuentoMaximo = calcularDescuentoMaximo(precioBase, precioMinimo);

  if (!Number.isFinite(precioBase) || precioBase <= 0) {
    return {
      precioBase: 0,
      precioFinal: 0,
      precioSinTope: 0,
      descuentoEfectivo: 0,
      aportes,
      precioMinimo,
      topeAplicado: false,
      descuentoMaximo,
    };
  }

  // Niveles 1 a 3: cada uno sobre el resultado del anterior.
  let precio = precioBase;
  const enCascada: [NivelDescuento, number][] = [
    ['sucursal', normalizarPorcentaje(entrada.descuentoSucursal)],
    ['categoria', normalizarPorcentaje(entrada.descuentoCategoria)],
    ['producto', normalizarPorcentaje(entrada.descuentoProducto)],
  ];

  for (const [nivel, porcentaje] of enCascada) {
    if (porcentaje === 0) continue;
    precio = precio * (1 - porcentaje / 100);
    aportes.push({ nivel, porcentaje, precioResultante: redondear(precio) });
  }

  // Nivel 4: el descuento del cliente se suma al efectivo acumulado.
  const descuentoCliente = normalizarPorcentaje(entrada.descuentoCliente);
  const efectivoCascada = (1 - precio / precioBase) * 100;
  const efectivoTotal = Math.min(efectivoCascada + descuentoCliente, 100);

  if (descuentoCliente > 0) {
    precio = precioBase * (1 - efectivoTotal / 100);
    aportes.push({
      nivel: 'cliente',
      porcentaje: descuentoCliente,
      precioResultante: redondear(precio),
    });
  }

  const precioSinTope = redondear(precio);

  // El margen mínimo recorta: nunca por debajo del piso.
  let precioFinal = precioSinTope;
  let topeAplicado = false;
  if (precioMinimo !== null && precioSinTope < precioMinimo) {
    precioFinal = precioMinimo;
    topeAplicado = true;
  }

  return {
    precioBase: redondear(precioBase),
    precioFinal,
    precioSinTope,
    descuentoEfectivo: redondear((1 - precioFinal / precioBase) * 100),
    aportes,
    precioMinimo,
    topeAplicado,
    descuentoMaximo,
  };
}
