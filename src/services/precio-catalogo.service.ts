import { PoolClient } from 'pg';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { CatalogoError } from '../utils/errors';
import { ContextoMonetario, Moneda, PrecioInput, PrecioResuelto, prepararCosto, prepararPrecio } from '../utils/moneda';

export function validarContratoPrecio(data: object, campos: string[],
  mensaje = 'Cargá un solo precio con su moneda de referencia y la cotización confirmada.') {
  const body = data as Record<string, unknown>;
  if (campos.some((campo) => campo in body)) {
    throw new CatalogoError(mensaje, 'PRECIO_REQUIERE_REFERENCIA');
  }
}

export interface MontosCatalogo { precio?: PrecioInput | null; costo?: PrecioInput | null }
export interface MontosResueltos { precio?: PrecioResuelto; costo?: PrecioResuelto }

/**
 * Resuelve en una transacción el precio y/o el costo enviados con la cotización
 * vigente. Solo se resuelven los montos presentes en `montos`.
 */
export async function escribirConMontos<T>(tenantId: string, montos: MontosCatalogo,
  guardar: (client: PoolClient, resueltos: MontosResueltos, contexto: ContextoMonetario) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    const contexto = await new CotizacionRepository().obtener(tenantId, client);
    return guardar(client, {
      ...('precio' in montos ? { precio: prepararPrecio(montos.precio ?? null, contexto) } : {}),
      ...('costo' in montos ? { costo: prepararCosto(montos.costo ?? null, contexto) } : {}),
    }, contexto);
  });
}

/** Columnas a persistir para un monto resuelto: foto ARS, principal USD y moneda. */
export function columnasMonto(resuelto: PrecioResuelto): { ars: string | null; usd: string | null; moneda: Moneda } {
  return {
    ars: resuelto.ars,
    usd: resuelto.usd,
    moneda: resuelto.importe_referencia == null ? 'ARS' : resuelto.moneda_referencia,
  };
}
