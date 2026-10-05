import { PoolClient } from 'pg';
import { CotizacionRepository } from '../repositories/cotizacion.repository';
import { withTransaction } from '../utils/db-transaction';
import { CatalogoError } from '../utils/errors';
import { ContextoMonetario, PrecioInput, PrecioResuelto, prepararPrecio } from '../utils/moneda';

export function validarContratoPrecio(data: object, campos: string[]) {
  const body = data as Record<string, unknown>;
  if (campos.some((campo) => campo in body)) {
    throw new CatalogoError('Cargá un solo precio con su moneda de referencia y la cotización confirmada.', 'PRECIO_REQUIERE_REFERENCIA');
  }
}

export async function escribirConPrecio<T>(tenantId: string, precio: PrecioInput | null,
  guardar: (client: PoolClient, resuelto: PrecioResuelto, contexto: ContextoMonetario) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    const contexto = await new CotizacionRepository().obtener(tenantId, client);
    return guardar(client, prepararPrecio(precio, contexto), contexto);
  });
}
