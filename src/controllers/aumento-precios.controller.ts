import type { RequestHandler } from 'express';
import { aplicarAumento, vistaPreviaAumento } from '../services/aumento-precios.service';
import { resolverSucursalAlcance } from '../services/sucursal-alcance.service';
import { CatalogoError } from '../utils/errors';
import { errorResponse, successResponse } from '../utils/response';

function manejarAumento(accion: typeof vistaPreviaAumento | typeof aplicarAumento): RequestHandler {
  return async (req, res) => {
    try {
      const acceso = await resolverSucursalAlcance(req.user!.id);
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new CatalogoError('Los datos del aumento no son válidos.', 'AUMENTO_INVALIDO');
      }
      res.json(successResponse(await accion(acceso, body)));
    } catch (error) {
      if (error instanceof CatalogoError) {
        res.status(error.status).json({ ...errorResponse(error.message), code: error.code });
        return;
      }
      console.error('[AumentoPrecios]', error);
      res.status(500).json(errorResponse('No se pudo procesar el aumento de precios.'));
    }
  };
}

export const previsualizarAumento = manejarAumento(vistaPreviaAumento);
export const confirmarAumento = manejarAumento(aplicarAumento);
