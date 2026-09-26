import { pool } from '../config/db';
import { withTransaction } from '../utils/db-transaction';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';

export interface ClienteFiltros {
  nombre?: string;
  tipoCliente?: string;
  condicionIva?: string;
  provincia?: string;
  sucursal?: string;
  estado?: string;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  nombre: 'c.nombre',
  tipoCliente: 'c.tipo_cliente',
  razonSocial: 'c.razon_social',
  nroDocumento: 'c.nro_documento',
  condicionIva: 'c.condicion_iva',
  email: 'c.email',
  telefono: 'c.telefono',
  localidad: 'c.localidad',
  provincia: 'c.provincia',
  sucursales: 'sucursales_nombres',
  descuentoPorcentaje: 'c.descuento_porcentaje',
  estado: 'c.activo',
};

export type TipoCliente = 'persona' | 'empresa';

export interface ClienteData {
  tenant_id: string;
  nombre: string;
  tipo_cliente?: TipoCliente;
  razon_social?: string | null;
  nombre_contacto?: string | null;
  tipo_documento?: string | null;
  nro_documento?: string | null;
  condicion_iva?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  codigo_postal?: string | null;
  descuento_porcentaje?: number | null;
  observaciones?: string | null;
  activo?: boolean;
  sucursal_ids?: string[];
}

const SEARCHABLE_COLUMNS = [
  'c.nombre',
  'c.razon_social',
  'c.nombre_contacto',
  'c.nro_documento',
  'c.email',
  'c.telefono',
];

/**
 * Las sucursales del cliente viajan agregadas en la misma consulta, para no
 * disparar una query por fila al listar.
 */
const SUCURSALES_SELECT = `
  COALESCE((
    SELECT json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre)
    FROM public.cliente_sucursal cs
    JOIN public.sucursal s ON s.id = cs.sucursal_id
    WHERE cs.cliente_id = c.id
  ), '[]'::json) AS sucursales
`;

const SUCURSALES_NOMBRES_SELECT = `
  COALESCE((
    SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
    FROM public.cliente_sucursal cs
    JOIN public.sucursal s ON s.id = cs.sucursal_id
    WHERE cs.cliente_id = c.id
  ), '') AS sucursales_nombres
`;

export class ClienteRepository {

  async findAll(tenantId: string, operativo = false) {
    const { rows } = await pool.query(
      `SELECT c.*, ${SUCURSALES_SELECT}
       FROM public.cliente c
       WHERE c.tenant_id = $1 ${operativo ? 'AND c.activo = TRUE' : ''}
       ORDER BY c.nombre`,
      [tenantId]
    );
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, search?: string) {
    const sentinel = getLimitSentinel(limit);
    const params: unknown[] = [tenantId, sentinel, offset];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (${SEARCHABLE_COLUMNS.map((col) => `${col} ILIKE $${idx}`).join(' OR ')})`;
    }
    const { rows } = await pool.query(
      `SELECT c.*, ${SUCURSALES_SELECT}
       FROM public.cliente c
       WHERE c.tenant_id = $1 ${searchClause}
       ORDER BY c.nombre
       LIMIT $2 OFFSET $3`,
      params
    );
    return sliceWithHasMore(rows, limit);
  }

  async findPaginatedWithTotal(
    tenantId: string,
    limit: number,
    offset: number,
    search?: string,
    filtros?: ClienteFiltros,
    sortBy?: string,
    sortDir?: string
  ) {
    const params: unknown[] = [tenantId];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (${SEARCHABLE_COLUMNS.map((col) => `${col} ILIKE $${idx}`).join(' OR ')})`;
    }

    const filterClauses: string[] = [];
    if (filtros?.nombre) {
      params.push(`%${filtros.nombre}%`);
      filterClauses.push(`c.nombre ILIKE $${params.length}`);
    }
    if (filtros?.tipoCliente) {
      params.push(filtros.tipoCliente);
      filterClauses.push(`c.tipo_cliente = $${params.length}`);
    }
    if (filtros?.condicionIva) {
      params.push(filtros.condicionIva);
      filterClauses.push(`c.condicion_iva = $${params.length}`);
    }
    if (filtros?.provincia) {
      params.push(filtros.provincia);
      filterClauses.push(`c.provincia = $${params.length}`);
    }
    if (filtros?.sucursal) {
      params.push(filtros.sucursal);
      filterClauses.push(
        `EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs
           JOIN public.sucursal s ON s.id = cs.sucursal_id
           WHERE cs.cliente_id = c.id AND s.nombre = $${params.length}
         )`
      );
    }
    if (filtros?.estado) {
      params.push(filtros.estado === 'Activo');
      filterClauses.push(`c.activo = $${params.length}`);
    }
    const filtersSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const orderBy = buildMultiOrderByClause(parseSortParam(sortBy, sortDir), SORTABLE_COLUMNS, 'c.nombre ASC');

    const countQuery = `
      SELECT COUNT(*) FROM public.cliente c
      WHERE c.tenant_id = $1 ${searchClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT c.*, ${SUCURSALES_SELECT}, ${SUCURSALES_NOMBRES_SELECT}
      FROM public.cliente c
      WHERE c.tenant_id = $1 ${searchClause} ${filtersSql}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, params),
      pool.query(dataQuery, dataParams),
    ]);

    return {
      items: dataResult.rows,
      total: Number(countResult.rows[0].count),
    };
  }

  async findValoresUnicos(tenantId: string, campo: string): Promise<string[]> {
    const columnasPermitidas: Record<string, string> = {
      nombre: 'c.nombre',
      razonSocial: 'c.razon_social',
      condicionIva: 'c.condicion_iva',
      provincia: 'c.provincia',
      localidad: 'c.localidad',
    };

    if (campo === 'estado') {
      return ['Activo', 'Inactivo'];
    }

    if (campo === 'tipoCliente') {
      return ['persona', 'empresa'];
    }

    if (campo === 'sucursal') {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.nombre AS valor
         FROM public.sucursal s
         WHERE s.tenant_id = $1 AND s.nombre IS NOT NULL
         ORDER BY valor`,
        [tenantId]
      );
      return rows.map((r) => r.valor);
    }

    const columna = columnasPermitidas[campo];
    if (!columna) return [];

    const { rows } = await pool.query(
      `SELECT DISTINCT ${columna} AS valor
       FROM public.cliente c
       WHERE c.tenant_id = $1 AND ${columna} IS NOT NULL AND ${columna} <> ''
       ORDER BY valor`,
      [tenantId]
    );
    return rows.map((r) => r.valor);
  }

  async findById(id: string, tenantId: string) {
    const { rows } = await pool.query(
      `SELECT c.*, ${SUCURSALES_SELECT}
       FROM public.cliente c
       WHERE c.id = $1 AND c.tenant_id = $2
       LIMIT 1`,
      [id, tenantId]
    );
    return rows[0] ?? null;
  }

  /**
   * Verifica que todas las sucursales pertenezcan al tenant, para que un cliente
   * no quede asociado a la sucursal de otra empresa.
   */
  async sucursalesInvalidas(sucursalIds: string[], tenantId: string): Promise<string[]> {
    if (sucursalIds.length === 0) return [];
    const { rows } = await pool.query(
      `SELECT id FROM public.sucursal WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [sucursalIds, tenantId]
    );
    const validas = new Set(rows.map((r) => r.id as string));
    return sucursalIds.filter((id) => !validas.has(id));
  }

  async create(data: ClienteData) {
    const { sucursal_ids = [], ...cliente } = data;

    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.cliente
          (tenant_id, nombre, tipo_cliente, razon_social, nombre_contacto,
           tipo_documento, nro_documento, condicion_iva,
           email, telefono, direccion, localidad, provincia, codigo_postal,
           descuento_porcentaje, observaciones, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          cliente.tenant_id,
          cliente.nombre,
          cliente.tipo_cliente ?? 'persona',
          cliente.razon_social ?? null,
          cliente.nombre_contacto ?? null,
          cliente.tipo_documento ?? null,
          cliente.nro_documento ?? null,
          cliente.condicion_iva ?? null,
          cliente.email ?? null,
          cliente.telefono ?? null,
          cliente.direccion ?? null,
          cliente.localidad ?? null,
          cliente.provincia ?? null,
          cliente.codigo_postal ?? null,
          cliente.descuento_porcentaje ?? null,
          cliente.observaciones ?? null,
          cliente.activo ?? true,
        ]
      );
      const creado = rows[0];
      await this.reemplazarSucursales(client, creado.id, sucursal_ids);
      return this.conSucursales(client, creado.id, cliente.tenant_id);
    });
  }

  async update(id: string, data: Partial<ClienteData>, tenantId: string) {
    const { sucursal_ids, ...cliente } = data;

    const fields = [
      'nombre', 'tipo_cliente', 'razon_social', 'nombre_contacto',
      'tipo_documento', 'nro_documento', 'condicion_iva',
      'email', 'telefono', 'direccion', 'localidad', 'provincia', 'codigo_postal',
      'descuento_porcentaje', 'observaciones', 'activo',
    ];

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields) {
      if (field in cliente) {
        updates.push(`${field} = $${idx++}`);
        values.push((cliente as Record<string, unknown>)[field]);
      }
    }

    if (updates.length === 0 && sucursal_ids === undefined) return null;

    return withTransaction(async (client) => {
      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        const { rows } = await client.query(
          `UPDATE public.cliente
           SET ${updates.join(', ')}
           WHERE id = $${idx++} AND tenant_id = $${idx}
           RETURNING id`,
          [...values, id, tenantId]
        );
        if (!rows[0]) return null;
      } else {
        const { rows } = await client.query(
          'SELECT id FROM public.cliente WHERE id = $1 AND tenant_id = $2',
          [id, tenantId]
        );
        if (!rows[0]) return null;
      }

      if (sucursal_ids !== undefined) {
        await this.reemplazarSucursales(client, id, sucursal_ids);
        await client.query('UPDATE public.cliente SET updated_at = NOW() WHERE id = $1', [id]);
      }

      return this.conSucursales(client, id, tenantId);
    });
  }

  /**
   * La baja de un cliente es lógica: no se borra la fila, se marca inactivo.
   * Así el historial comercial que se le asocie más adelante queda intacto.
   */
  async desactivar(id: string, tenantId: string) {
    const { rows } = await pool.query(
      `UPDATE public.cliente
       SET activo = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );
    if (!rows[0]) return null;
    return this.findById(id, tenantId);
  }

  private async reemplazarSucursales(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    clienteId: string,
    sucursalIds: string[]
  ) {
    await client.query('DELETE FROM public.cliente_sucursal WHERE cliente_id = $1', [clienteId]);
    const unicos = [...new Set(sucursalIds)];
    for (const sucursalId of unicos) {
      await client.query(
        'INSERT INTO public.cliente_sucursal (cliente_id, sucursal_id) VALUES ($1, $2)',
        [clienteId, sucursalId]
      );
    }
  }

  private async conSucursales(
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
    clienteId: string,
    tenantId: string
  ) {
    const { rows } = await client.query(
      `SELECT c.*, ${SUCURSALES_SELECT}
       FROM public.cliente c
       WHERE c.id = $1 AND c.tenant_id = $2
       LIMIT 1`,
      [clienteId, tenantId]
    );
    return rows[0] ?? null;
  }
}
