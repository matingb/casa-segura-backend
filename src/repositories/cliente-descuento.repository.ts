import { pool } from '../config/db';

export interface ClienteDescuentoCategoriaRow {
  id: string;
  cliente_id: string;
  tipo_id: string | null;
  tipo_nombre: string | null;
  subtipo_id: string | null;
  subtipo_nombre: string | null;
  categoria_padre_id: string | null;
  categoria_padre_nombre: string | null;
  porcentaje: number;
  nota: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClienteDescuentoProductoRow {
  id: string;
  cliente_id: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  producto_precio_base: number;
  porcentaje: number;
  nota: string | null;
  created_at: string;
  updated_at: string;
}

export type DestinoClienteDescuento = { tipoId: string } | { subtipoId: string };

export class ClienteDescuentoRepository {
  async findCategoriasByCliente(clienteId: string, tenantId: string): Promise<ClienteDescuentoCategoriaRow[]> {
    const query = `
      SELECT
        cdc.id,
        cdc.cliente_id,
        cdc.tipo_id,
        t.nombre AS tipo_nombre,
        cdc.subtipo_id,
        s.nombre AS subtipo_nombre,
        s.tipo_id AS categoria_padre_id,
        t_padre.nombre AS categoria_padre_nombre,
        cdc.porcentaje,
        cdc.nota,
        cdc.created_at,
        cdc.updated_at
      FROM public.cliente_descuento_categoria cdc
      JOIN public.cliente c ON c.id = cdc.cliente_id
      LEFT JOIN public.tipo t ON t.id = cdc.tipo_id
      LEFT JOIN public.subtipo s ON s.id = cdc.subtipo_id
      LEFT JOIN public.tipo t_padre ON t_padre.id = s.tipo_id
      WHERE cdc.cliente_id = $1
        AND c.tenant_id = $2
      ORDER BY COALESCE(t.nombre, t_padre.nombre, ''), s.nombre NULLS FIRST
    `;
    const { rows } = await pool.query(query, [clienteId, tenantId]);
    return rows;
  }

  async upsertCategoria(
    clienteId: string,
    destino: DestinoClienteDescuento,
    porcentaje: number,
    nota?: string | null
  ): Promise<ClienteDescuentoCategoriaRow> {
    const esTipo = 'tipoId' in destino;
    const conflictTarget = esTipo
      ? '(cliente_id, tipo_id) WHERE tipo_id IS NOT NULL'
      : '(cliente_id, subtipo_id) WHERE subtipo_id IS NOT NULL';

    const query = `
      INSERT INTO public.cliente_descuento_categoria (
        cliente_id, tipo_id, subtipo_id, porcentaje, nota
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ${conflictTarget}
      DO UPDATE SET
        porcentaje = EXCLUDED.porcentaje,
        nota = EXCLUDED.nota,
        updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      clienteId,
      esTipo ? destino.tipoId : null,
      esTipo ? null : (destino as { subtipoId: string }).subtipoId,
      porcentaje,
      nota ?? null,
    ]);
    return rows[0];
  }

  async deleteCategoria(clienteId: string, id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM public.cliente_descuento_categoria cdc
      USING public.cliente c
      WHERE cdc.id = $1
        AND cdc.cliente_id = c.id
        AND cdc.cliente_id = $2
        AND c.tenant_id = $3
      RETURNING cdc.id
    `;
    const { rows } = await pool.query(query, [id, clienteId, tenantId]);
    return rows.length > 0;
  }

  async findProductosByCliente(clienteId: string, tenantId: string): Promise<ClienteDescuentoProductoRow[]> {
    const query = `
      SELECT
        cdp.id,
        cdp.cliente_id,
        cdp.producto_id,
        p.codigo AS producto_codigo,
        p.nombre AS producto_nombre,
        p.precio_base AS producto_precio_base,
        cdp.porcentaje,
        cdp.nota,
        cdp.created_at,
        cdp.updated_at
      FROM public.cliente_descuento_producto cdp
      JOIN public.cliente c ON c.id = cdp.cliente_id
      JOIN public.producto p ON p.id = cdp.producto_id
      WHERE cdp.cliente_id = $1
        AND c.tenant_id = $2
        AND p.tenant_id = $2
      ORDER BY p.nombre ASC
    `;
    const { rows } = await pool.query(query, [clienteId, tenantId]);
    return rows;
  }

  async upsertProducto(
    clienteId: string,
    productoId: string,
    porcentaje: number,
    nota?: string | null
  ): Promise<ClienteDescuentoProductoRow> {
    const query = `
      INSERT INTO public.cliente_descuento_producto (
        cliente_id, producto_id, porcentaje, nota
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cliente_id, producto_id)
      DO UPDATE SET
        porcentaje = EXCLUDED.porcentaje,
        nota = EXCLUDED.nota,
        updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await pool.query(query, [
      clienteId,
      productoId,
      porcentaje,
      nota ?? null,
    ]);
    return rows[0];
  }

  async deleteProducto(clienteId: string, id: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM public.cliente_descuento_producto cdp
      USING public.cliente c
      WHERE cdp.id = $1
        AND cdp.cliente_id = c.id
        AND cdp.cliente_id = $2
        AND c.tenant_id = $3
      RETURNING cdp.id
    `;
    const { rows } = await pool.query(query, [id, clienteId, tenantId]);
    return rows.length > 0;
  }

  async existeCliente(clienteId: string, tenantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM public.cliente WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [clienteId, tenantId]
    );
    return rows.length > 0;
  }

  async existeProducto(productoId: string, tenantId: string): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM public.producto WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [productoId, tenantId]
    );
    return rows.length > 0;
  }
}
