import { pool } from '../config/db';
import { withTransaction } from '../utils/db-transaction';
import { getLimitSentinel, sliceWithHasMore } from '../utils/pagination';
import { buildMultiOrderByClause, parseSortParam } from '../utils/sorting';
import { BusinessError } from '../utils/errors';
import { CatalogoError } from '../utils/errors';

export interface ClienteFiltros {
  nombre?: string;
  tipoCliente?: string;
  condicionIva?: string;
  provincia?: string;
  region?: string;
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

const sucursalesSelect = (scopeParam?: string) => `
  COALESCE((
    SELECT json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre)
    FROM public.cliente_sucursal cs
    JOIN public.sucursal s ON s.id = cs.sucursal_id
    WHERE cs.cliente_id = c.id ${scopeParam ? `AND cs.sucursal_id = ANY(${scopeParam}::uuid[])` : ''}
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

const sucursalesNombresSelect = (scopeParam?: string) => `
  COALESCE((
    SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
    FROM public.cliente_sucursal cs
    JOIN public.sucursal s ON s.id = cs.sucursal_id
    WHERE cs.cliente_id = c.id ${scopeParam ? `AND cs.sucursal_id = ANY(${scopeParam}::uuid[])` : ''}
  ), '') AS sucursales_nombres
`;

export class ClienteRepository {

  async findAll(tenantId: string, operativo = false, sucursalIds?: string[]) {
    if (sucursalIds && sucursalIds.length === 0) return [];
    const sucursales = sucursalIds ? sucursalesSelect('$2') : SUCURSALES_SELECT;
    const { rows } = await pool.query(
      `SELECT c.*, ${sucursales}
       FROM public.cliente c
       WHERE c.tenant_id = $1
         AND ($2::uuid[] IS NULL OR EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs
           WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])
         )) ${operativo ? 'AND c.activo = TRUE' : ''}
       ORDER BY c.nombre`,
      [tenantId, sucursalIds ?? null]
    );
    return rows;
  }

  async findPaginated(tenantId: string, limit: number, offset: number, search?: string, sucursalIds?: string[]) {
    if (sucursalIds && sucursalIds.length === 0) return { items: [], hasMore: false };
    const sentinel = getLimitSentinel(limit);
    const sucursales = sucursalIds ? sucursalesSelect('$2') : SUCURSALES_SELECT;
    const params: unknown[] = [tenantId, sucursalIds ?? null, sentinel, offset];
    let searchClause = '';
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      searchClause = `AND (${SEARCHABLE_COLUMNS.map((col) => `${col} ILIKE $${idx}`).join(' OR ')})`;
    }
    const { rows } = await pool.query(
      `SELECT c.*, ${sucursales}
       FROM public.cliente c
       WHERE c.tenant_id = $1
         AND ($2::uuid[] IS NULL OR EXISTS (SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])))
         ${searchClause}
       ORDER BY c.nombre
       LIMIT $3 OFFSET $4`,
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
    sortDir?: string,
    sucursalIds?: string[]
  ) {
    if (sucursalIds && sucursalIds.length === 0) return { items: [], total: 0 };
    const sucursales = sucursalIds ? sucursalesSelect('$2') : SUCURSALES_SELECT;
    const sucursalesNombres = sucursalIds ? sucursalesNombresSelect('$2') : SUCURSALES_NOMBRES_SELECT;
    const params: unknown[] = [tenantId, sucursalIds ?? null];
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
    if (filtros?.sucursal || filtros?.region) {
      const condiciones = [];
      if (filtros.sucursal) {
        params.push(filtros.sucursal);
        condiciones.push(`AND s.nombre = $${params.length}`);
      }
      if (filtros.region) {
        params.push(filtros.region);
        condiciones.push(`AND EXISTS (
          SELECT 1 FROM public.cliente_region cr
          JOIN public.region r ON r.id = cr.region_id AND r.tenant_id = $1
          WHERE cr.cliente_id = c.id AND cr.sucursal_id = cs.sucursal_id AND r.nombre = $${params.length}
        )`);
      }
      filterClauses.push(
        `EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs
           JOIN public.sucursal s ON s.id = cs.sucursal_id AND s.tenant_id = $1
           WHERE cs.cliente_id = c.id
             AND ($2::uuid[] IS NULL OR cs.sucursal_id = ANY($2::uuid[]))
             ${condiciones.join(' ')}
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
      WHERE c.tenant_id = $1
        AND ($2::uuid[] IS NULL OR EXISTS (SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])))
        ${searchClause} ${filtersSql}
    `;
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT c.*, ${sucursales}, ${sucursalesNombres}
      FROM public.cliente c
      WHERE c.tenant_id = $1
        AND ($2::uuid[] IS NULL OR EXISTS (SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])))
        ${searchClause} ${filtersSql}
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

  async findValoresUnicos(tenantId: string, campo: string, sucursalIds?: string[]): Promise<string[]> {
    if (sucursalIds && sucursalIds.length === 0) return [];
    const columnasPermitidas: Record<string, string> = {
      nombre: 'c.nombre',
      razonSocial: 'c.razon_social',
      condicionIva: 'c.condicion_iva',
      provincia: 'c.provincia',
      localidad: 'c.localidad',
    };

    if (campo === 'estado') {
      const { rows } = await pool.query(
        `SELECT DISTINCT CASE WHEN c.activo THEN 'Activo' ELSE 'Inactivo' END AS valor
         FROM public.cliente c
         WHERE c.tenant_id = $1 AND ($2::uuid[] IS NULL OR EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])
         )) ORDER BY valor`, [tenantId, sucursalIds ?? null]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'tipoCliente') {
      const { rows } = await pool.query(
        `SELECT DISTINCT c.tipo_cliente AS valor FROM public.cliente c
         WHERE c.tenant_id = $1 AND ($2::uuid[] IS NULL OR EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])
         )) AND c.tipo_cliente IS NOT NULL ORDER BY valor`, [tenantId, sucursalIds ?? null]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'region') {
      const { rows } = await pool.query(
        `SELECT DISTINCT r.nombre AS valor
         FROM public.region r
         JOIN public.region_sucursal rs ON rs.region_id = r.id
         JOIN public.sucursal s ON s.id = rs.sucursal_id AND s.tenant_id = $1
         WHERE r.tenant_id = $1
           AND ($2::uuid[] IS NULL OR rs.sucursal_id = ANY($2::uuid[]))
         ORDER BY valor`,
        [tenantId, sucursalIds ?? null]
      );
      return rows.map((r) => r.valor);
    }

    if (campo === 'sucursal') {
      const { rows } = await pool.query(
        `SELECT DISTINCT s.nombre AS valor
         FROM public.sucursal s
         JOIN public.cliente_sucursal cs ON cs.sucursal_id = s.id
         JOIN public.cliente c ON c.id = cs.cliente_id AND c.tenant_id = $1
         WHERE s.tenant_id = $1 AND s.nombre IS NOT NULL
           AND ($2::uuid[] IS NULL OR s.id = ANY($2::uuid[]))
         ORDER BY valor`,
        [tenantId, sucursalIds ?? null]
      );
      return rows.map((r) => r.valor);
    }

    const columna = columnasPermitidas[campo];
    if (!columna) return [];

    const { rows } = await pool.query(
      `SELECT DISTINCT ${columna} AS valor
       FROM public.cliente c
       WHERE c.tenant_id = $1 AND ${columna} IS NOT NULL AND ${columna} <> ''
         AND ($2::uuid[] IS NULL OR EXISTS (SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($2::uuid[])))
       ORDER BY valor`,
      [tenantId, sucursalIds ?? null]
    );
    return rows.map((r) => r.valor);
  }

  async findById(id: string, tenantId: string, sucursalIds?: string[]) {
    if (sucursalIds && sucursalIds.length === 0) return null;
    const sucursales = sucursalIds ? sucursalesSelect('$3') : SUCURSALES_SELECT;
    const { rows } = await pool.query(
      `SELECT c.*, ${sucursales}
       FROM public.cliente c
       WHERE c.id = $1 AND c.tenant_id = $2
         AND ($3::uuid[] IS NULL OR EXISTS (SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($3::uuid[])))
       LIMIT 1`,
      [id, tenantId, sucursalIds ?? null]
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

  async create(data: ClienteData, sucursalIdsPermitidas?: string[], sucursalIdsActivas?: string[]) {
    const { sucursal_ids = [], ...cliente } = data;

    return withTransaction(async (client) => {
      if (sucursalIdsPermitidas) {
        const unicas = [...new Set(sucursal_ids)];
        if (unicas.some((id) => !sucursalIdsPermitidas.includes(id) || !sucursalIdsActivas?.includes(id))) {
          throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
        }
        const { rows: validas } = await client.query(
          `SELECT id FROM public.sucursal WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND activo = TRUE`,
          [unicas, cliente.tenant_id]
        );
        if (validas.length !== unicas.length) {
          throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
        }
      }
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

  /** Actualiza datos comunes y solo la porción de asociaciones visible al usuario, bajo lock del cliente. */
  async updateEnAlcance(
    id: string,
    data: Partial<ClienteData>,
    tenantId: string,
    sucursalIdsPermitidas: string[],
    sucursalIdsActivas: string[],
    authId: string
  ): Promise<{ cliente: any | null; acceso_revocado: boolean } | null> {
    if (sucursalIdsPermitidas.length === 0) return null;
    const { sucursal_ids, ...cliente } = data;
    const campos = [
      'nombre', 'tipo_cliente', 'razon_social', 'nombre_contacto', 'tipo_documento', 'nro_documento',
      'condicion_iva', 'email', 'telefono', 'direccion', 'localidad', 'provincia', 'codigo_postal',
      'descuento_porcentaje', 'observaciones', 'activo',
    ];

    return withTransaction(async (clientDb) => {
      const { rows: asignaciones } = await clientDb.query(
        `SELECT s.id AS sucursal_id, s.activo AS sucursal_activa
         FROM public.usuario u
         JOIN public.usuario_sucursal us ON us.usuario_id = u.id AND us.activo = TRUE
         JOIN public.sucursal s ON s.id = us.sucursal_id AND s.tenant_id = u.tenant_id
         WHERE u.auth_id = $1 AND u.tenant_id = $2 AND u.activo = TRUE
           AND s.id = ANY($3::uuid[])
         FOR SHARE OF u, us, s`,
        [authId, tenantId, sucursalIdsPermitidas]
      );
      const alcanceTransaccional = asignaciones.map((row) => row.sucursal_id as string);
      const sucursalesActivasTransaccionales = asignaciones
        .filter((row) => row.sucursal_activa === true)
        .map((row) => row.sucursal_id as string)
        .filter((sucursalId) => sucursalIdsActivas.includes(sucursalId));
      if (alcanceTransaccional.length === 0) return null;

      const { rows: protegidos } = await clientDb.query(
        `SELECT c.id FROM public.cliente c
         WHERE c.id = $1 AND c.tenant_id = $2
           AND EXISTS (
             SELECT 1 FROM public.cliente_sucursal cs
             WHERE cs.cliente_id = c.id AND cs.sucursal_id = ANY($3::uuid[])
           )
         FOR UPDATE`,
        [id, tenantId, alcanceTransaccional]
      );
      if (!protegidos[0]) return null;

      const { rows: relaciones } = await clientDb.query(
        `SELECT cs.sucursal_id, s.activo
         FROM public.cliente_sucursal cs
         JOIN public.sucursal s ON s.id = cs.sucursal_id AND s.tenant_id = $2
         WHERE cs.cliente_id = $1
         ORDER BY cs.sucursal_id
         FOR UPDATE OF cs`,
        [id, tenantId]
      );
      const actuales = relaciones.map((row) => row.sucursal_id as string);
      const actualesPropias = actuales.filter((sucursalId) => alcanceTransaccional.includes(sucursalId));
      let finales = actuales;

      if (sucursal_ids !== undefined) {
        if (!Array.isArray(sucursal_ids) || !sucursal_ids.every((sucursalId) => typeof sucursalId === 'string')) {
          throw new BusinessError('La lista de puntos de venta no es válida.');
        }
        const deseadas = [...new Set(sucursal_ids)];
        if (deseadas.some((sucursalId) => !alcanceTransaccional.includes(sucursalId))) {
          throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
        }
        const agregadas = deseadas.filter((sucursalId) => !actualesPropias.includes(sucursalId));
        if (agregadas.some((sucursalId) => !sucursalesActivasTransaccionales.includes(sucursalId))) {
          throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
        }
        if (agregadas.length > 0) {
          const { rows: activas } = await clientDb.query(
            `SELECT id FROM public.sucursal
             WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND activo = TRUE`,
            [agregadas, tenantId]
          );
          if (activas.length !== agregadas.length) {
            throw new CatalogoError('El punto de venta está fuera de tu alcance.', 'SUCURSAL_FUERA_DE_ALCANCE', 403);
          }
        }

        const quitadas = actualesPropias.filter((sucursalId) => !deseadas.includes(sucursalId));
        if (quitadas.length > 0) {
          await clientDb.query(
            'DELETE FROM public.cliente_region WHERE cliente_id = $1 AND sucursal_id = ANY($2::uuid[])',
            [id, quitadas]
          );
          await clientDb.query(
            'DELETE FROM public.cliente_sucursal WHERE cliente_id = $1 AND sucursal_id = ANY($2::uuid[])',
            [id, quitadas]
          );
        }
        for (const sucursalId of agregadas) {
          await clientDb.query(
            'INSERT INTO public.cliente_sucursal (cliente_id, sucursal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, sucursalId]
          );
        }
        finales = [...actuales.filter((sucursalId) => !actualesPropias.includes(sucursalId)), ...deseadas];
        if (finales.length === 0) {
          throw new BusinessError('El cliente debe conservar al menos un punto de venta asociado.');
        }
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      for (const campo of campos) {
        if (campo in cliente) {
          values.push((cliente as Record<string, unknown>)[campo]);
          updates.push(`${campo} = $${values.length}`);
        }
      }
      if (updates.length > 0 || sucursal_ids !== undefined) {
        updates.push('updated_at = NOW()');
        await clientDb.query(
          `UPDATE public.cliente SET ${updates.join(', ')} WHERE id = $${values.length + 1} AND tenant_id = $${values.length + 2}`,
          [...values, id, tenantId]
        );
      }

      const conservaAcceso = finales.some((sucursalId) => alcanceTransaccional.includes(sucursalId));
      if (!conservaAcceso) return { cliente: null, acceso_revocado: true };

      const { rows: clienteActualizado } = await clientDb.query(
        `SELECT c.*, ${sucursalesSelect('$3')}
         FROM public.cliente c
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [id, tenantId, alcanceTransaccional]
      );
      return { cliente: clienteActualizado[0] ?? null, acceso_revocado: false };
    });
  }

  /**
   * La baja de un cliente es lógica: no se borra la fila, se marca inactivo.
   * Así el historial comercial que se le asocie más adelante queda intacto.
   */
  async desactivar(id: string, tenantId: string, sucursalIds?: string[]) {
    if (sucursalIds && sucursalIds.length === 0) return null;
    const { rows } = await pool.query(
      `UPDATE public.cliente
       SET activo = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
         AND ($3::uuid[] IS NULL OR EXISTS (
           SELECT 1 FROM public.cliente_sucursal cs WHERE cs.cliente_id = public.cliente.id AND cs.sucursal_id = ANY($3::uuid[])
         ))
       RETURNING id`,
      [id, tenantId, sucursalIds ?? null]
    );
    if (!rows[0]) return null;
    return this.findById(id, tenantId, sucursalIds);
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
