import { Response } from 'express';
import { ClienteService } from '../services/cliente.service';
import { ClienteData, ClienteFiltros } from '../repositories/cliente.repository';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse, paginatedResponse } from '../utils/response';
import { normalizePaginationLimit } from '../utils/pagination';
import { TypedRequest, TypedRequestBody, TypedRequestParams, TypedRequestQuery } from '../types/request.types';
import { BusinessError } from '../utils/errors';

export interface ClienteQuery {
  limit?: string;
  offset?: string;
  search?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  filtro_nombre?: string;
  filtro_tipoCliente?: string;
  filtro_condicionIva?: string;
  filtro_provincia?: string;
  filtro_sucursal?: string;
  filtro_estado?: string;
  operativo?: string;
}

export interface ValoresUnicosQuery {
  campo?: string;
}

export class ClienteController {
  private clienteService: ClienteService;

  constructor() {
    this.clienteService = new ClienteService();
  }

  getAllClientes = async (req: TypedRequestQuery<ClienteQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const {
        limit, offset, search, page, sortBy, sortDir,
        filtro_nombre, filtro_tipoCliente, filtro_condicionIva, filtro_provincia,
        filtro_sucursal, filtro_estado, operativo,
      } = req.query;

      if (page !== undefined) {
        const normalizedLimit = normalizePaginationLimit(limit);
        const parsedPage = Math.max(1, Number(page) || 1);
        const parsedOffset = (parsedPage - 1) * normalizedLimit;
        const filtros: ClienteFiltros = {
          nombre: filtro_nombre,
          tipoCliente: filtro_tipoCliente,
          condicionIva: filtro_condicionIva,
          provincia: filtro_provincia,
          sucursal: filtro_sucursal,
          estado: filtro_estado,
        };
        const result = await this.clienteService.getPaginatedWithTotal(
          tenantId, normalizedLimit, parsedOffset, search, filtros, sortBy, sortDir
        );
        res.status(200).json({
          status: 'success',
          data: result.items,
          page: {
            page: parsedPage,
            limit: normalizedLimit,
            total: result.total,
            totalPages: Math.max(1, Math.ceil(result.total / normalizedLimit)),
          },
        });
        return;
      }

      if (limit === undefined) {
        const clientes = await this.clienteService.getAllClientes(tenantId, operativo === 'true');
        res.status(200).json(successResponse(clientes));
        return;
      }
      const normalizedLimit = normalizePaginationLimit(limit);
      const parsedOffset = Math.max(0, Number(offset) || 0);
      const result = await this.clienteService.getPaginated(tenantId, normalizedLimit, parsedOffset, search);
      res.status(200).json(paginatedResponse(result.items, result.hasMore));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] getAllClientes:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getValoresUnicos = async (req: TypedRequestQuery<ValoresUnicosQuery>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const { campo } = req.query;
      if (!campo) {
        res.status(400).json(errorResponse('El parámetro "campo" es requerido'));
        return;
      }
      const valores = await this.clienteService.getValoresUnicos(tenantId, campo);
      res.status(200).json(successResponse(valores));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] getValoresUnicos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getCliente = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const cliente = await this.clienteService.getCliente(req.params.id, tenantId);
      if (!cliente) {
        res.status(404).json(errorResponse('Cliente no encontrado'));
        return;
      }
      res.status(200).json(successResponse(cliente));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] getCliente:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  createCliente = async (
    req: TypedRequestBody<Omit<ClienteData, 'tenant_id'>>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const cliente = await this.clienteService.createCliente(req.body, tenantId);
      res.status(201).json(successResponse(cliente));
    } catch (error: unknown) {
      if (error instanceof BusinessError) {
        res.status(400).json(errorResponse(error.message));
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] createCliente:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  updateCliente = async (
    req: TypedRequest<unknown, Partial<ClienteData>, { id: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const cliente = await this.clienteService.updateCliente(req.params.id, req.body, tenantId);
      if (!cliente) {
        res.status(404).json(errorResponse('Cliente no encontrado'));
        return;
      }
      res.status(200).json(successResponse(cliente));
    } catch (error: unknown) {
      if (error instanceof BusinessError) {
        res.status(400).json(errorResponse(error.message));
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] updateCliente:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  deleteCliente = async (req: TypedRequestParams<{ id: string }>, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const cliente = await this.clienteService.desactivarCliente(req.params.id, tenantId);
      if (!cliente) {
        res.status(404).json(errorResponse('Cliente no encontrado'));
        return;
      }
      res.status(200).json(successResponse(cliente));
    } catch (error: unknown) {
      if (error instanceof BusinessError) {
        res.status(400).json(errorResponse(error.message));
        return;
      }
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ClienteController] deleteCliente:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
