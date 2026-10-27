import { SucursalRepository, SucursalData, AsignacionUsuario } from '../repositories/sucursal.repository';
import { BusinessError, CatalogoError } from '../utils/errors';
import { CotizacionRepository } from '../repositories/cotizacion.repository';

/** El body de alta/edición puede traer las asignaciones de usuarios de la sucursal. */
export type SucursalInput = SucursalData & { usuarios?: unknown };

export class SucursalService {
  private repo = new SucursalRepository();

  async getAll(tenantId: string, authId: string, soloActivas = false) {
    return this.repo.findAll(tenantId, authId, soloActivas);
  }

  async getByUser(authId: string, tenantId: string) {
    return this.repo.findByUsuario(authId, tenantId);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(tenantId: string, input: SucursalInput, authId: string) {
    const { usuarios, ...data } = input;
    if (!(await this.repo.esAdministrador(authId, tenantId))) {
      throw new CatalogoError('Solo un administrador puede crear sucursales.', 'SIN_PERMISO', 403);
    }
    this.validar(data);
    if (data.valor_dolar != null) await this.validarDolarHeredado(tenantId, data);
    const asignaciones = usuarios === undefined ? undefined : await this.prepararAsignaciones(tenantId, authId, usuarios, null);
    return this.repo.create(tenantId, data, authId, asignaciones);
  }

  async update(id: string, tenantId: string, input: Partial<SucursalInput>, authId: string) {
    const { usuarios, ...data } = input;
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
    await this.verificarAsignado(id, authId);
    this.validar(data);
    const asignaciones = usuarios === undefined
      ? undefined
      : await this.prepararAsignaciones(tenantId, authId, usuarios, await this.repo.findUsuariosAsignados(id, authId));

    if (data.valor_dolar !== undefined && (data.valor_dolar === null ? sucursal.valor_dolar != null : Number(data.valor_dolar) !== Number(sucursal.valor_dolar))) {
      await this.validarDolarHeredado(tenantId, data);
    }

    // Reactivar siempre se puede; desactivar pasa por las mismas reglas que la baja.
    if (data.activo === false && sucursal.activo) {
      await this.verificarPuedeDesactivar(id, tenantId, sucursal);
    }
    return this.repo.update(id, tenantId, data, asignaciones);
  }

  async getUsuariosAsignados(id: string, tenantId: string, authId: string) {
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
    return this.repo.findUsuariosAsignados(id, authId);
  }

  /** Lo que necesita el formulario para asignar: usuarios y roles del tenant, y si puede hacerlo. */
  async getOpcionesAsignacion(tenantId: string, authId: string) {
    const [puedeAdministrar, usuarios, roles] = await Promise.all([
      this.repo.esAdministrador(authId, tenantId),
      this.repo.findUsuariosDelTenant(tenantId, authId),
      this.repo.findRolesDelTenant(tenantId),
    ]);
    return { puede_administrar: puedeAdministrar, usuarios, roles };
  }

  async desactivar(id: string, tenantId: string, authId: string) {
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
    await this.verificarAsignado(id, authId);
    if (!sucursal.activo) return sucursal;

    await this.verificarPuedeDesactivar(id, tenantId, sucursal);
    return this.repo.desactivar(id, tenantId);
  }

  async resumenUso(id: string, tenantId: string) {
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
    return this.repo.resumenUso(id);
  }

  /**
   * Valida la lista completa de asignaciones que va a quedar en la sucursal.
   * Solo un administrador puede asignar; nadie puede quitarse ni cambiarse el
   * rol a sí mismo (`actuales` = asignaciones vigentes, null al crear). Al crear,
   * quien crea queda asignado como Administrador aunque no venga en la lista.
   */
  private async prepararAsignaciones(
    tenantId: string,
    authId: string,
    usuarios: unknown,
    actuales: { usuario_id: string; id_rol: string; es_actual: boolean }[] | null
  ): Promise<AsignacionUsuario[]> {
    if (!(await this.repo.esAdministrador(authId, tenantId))) {
      throw new CatalogoError('Solo un administrador puede asignar usuarios a una sucursal.', 'SIN_PERMISO', 403);
    }
    const esAsignacion = (a: unknown): a is AsignacionUsuario =>
      typeof (a as AsignacionUsuario)?.usuario_id === 'string' && typeof (a as AsignacionUsuario)?.id_rol === 'string';
    if (!Array.isArray(usuarios) || !usuarios.every(esAsignacion)) {
      throw new BusinessError('Cada asignación necesita un usuario y un rol.');
    }
    const lista = usuarios.map((a) => ({ usuario_id: a.usuario_id, id_rol: a.id_rol }));
    if (new Set(lista.map((a) => a.usuario_id)).size !== lista.length) {
      throw new BusinessError('Un usuario no puede estar asignado dos veces a la misma sucursal.');
    }

    const [delTenant, roles] = await Promise.all([
      this.repo.findUsuariosDelTenant(tenantId, authId),
      this.repo.findRolesDelTenant(tenantId),
    ]);
    // Un usuario dado de baja que ya estaba asignado puede quedar; no se lo puede sumar de nuevo.
    const idsUsuarios = new Set([...delTenant.map((u) => u.id), ...(actuales ?? []).map((a) => a.usuario_id)]);
    const idsRoles = new Set(roles.map((r) => r.id));
    if (lista.some((a) => !idsUsuarios.has(a.usuario_id))) {
      throw new BusinessError('Alguno de los usuarios elegidos no existe o está inactivo.');
    }
    if (lista.some((a) => !idsRoles.has(a.id_rol))) {
      throw new BusinessError('Alguno de los roles elegidos no existe.');
    }

    const yo = delTenant.find((u) => u.es_actual);
    const propia = yo && lista.find((a) => a.usuario_id === yo.id);
    if (actuales) {
      const antes = actuales.find((a) => a.es_actual);
      if (antes && !propia) {
        throw new BusinessError('No podés quitarte de una sucursal. Pedíselo a otro administrador.');
      }
      if (antes && propia && propia.id_rol !== antes.id_rol) {
        throw new BusinessError('No podés cambiar tu propio rol en la sucursal. Pedíselo a otro administrador.');
      }
    } else if (yo && !propia) {
      const admin = roles.find((r) => r.nombre === 'Administrador');
      if (!admin) throw new BusinessError('No existe el rol Administrador para asignar a quien crea la sucursal.');
      lista.push({ usuario_id: yo.id, id_rol: admin.id });
    }

    if (lista.length === 0) {
      throw new BusinessError('La sucursal tiene que tener al menos un usuario asignado.');
    }
    return lista;
  }

  /** Solo quien está asignado a una sucursal puede editarla, darla de baja o reactivarla. */
  private async verificarAsignado(id: string, authId: string) {
    if (!(await this.repo.estaAsignado(id, authId))) {
      throw new CatalogoError('No estás asignado a esta sucursal, por eso no podés modificarla.', 'SUCURSAL_NO_ASIGNADA', 403);
    }
  }

  /**
   * La casa central y la última sucursal activa no se pueden dar de baja: sin
   * ellas el tenant queda sin un lugar donde operar.
   */
  private async verificarPuedeDesactivar(
    id: string,
    tenantId: string,
    sucursal: { es_central?: boolean }
  ) {
    if (sucursal.es_central) {
      throw new BusinessError(
        'No se puede dar de baja la casa central. Designá otra sucursal como central primero.'
      );
    }
    const activas = await this.repo.contarActivas(tenantId);
    if (activas <= 1) {
      throw new BusinessError('No se puede dar de baja la única sucursal activa.');
    }
  }

  private validar(data: Partial<SucursalData>) {
    if ('nombre' in data) {
      const nombre = typeof data.nombre === 'string' ? data.nombre.trim() : '';
      if (!nombre) {
        throw new BusinessError('El nombre de la sucursal es obligatorio.');
      }
    }

    if (data.valor_dolar !== undefined && data.valor_dolar !== null) {
      const valor = Number(data.valor_dolar);
      if (!Number.isFinite(valor) || valor < 0) {
        throw new BusinessError('El valor del dólar debe ser un número positivo.');
      }
    }

    if (data.descuento !== undefined && data.descuento !== null) {
      const descuento = Number(data.descuento);
      if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
        throw new BusinessError('El descuento debe ser un porcentaje entre 0 y 100.');
      }
    }
  }

  private async validarDolarHeredado(tenantId: string, data: Partial<SucursalData>) {
    if (!('valor_dolar' in data)) return;
    const contexto = await new CotizacionRepository().obtener(tenantId);
    if (contexto.cotizacion_usd_ars !== null) {
      throw new BusinessError('El dólar se configura para toda la empresa en Configuración → Cotización. El valor anterior de sucursal se conserva como histórico.');
    }
  }
}
