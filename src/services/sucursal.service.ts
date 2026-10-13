import { SucursalRepository, SucursalData } from '../repositories/sucursal.repository';
import { BusinessError } from '../utils/errors';
import { CotizacionRepository } from '../repositories/cotizacion.repository';

export class SucursalService {
  private repo = new SucursalRepository();

  async getAll(tenantId: string, soloActivas = false) {
    return this.repo.findAll(tenantId, soloActivas);
  }

  async getByUser(authId: string, tenantId: string) {
    return this.repo.findByUsuario(authId, tenantId);
  }

  async getById(id: string, tenantId: string) {
    return this.repo.findById(id, tenantId);
  }

  async create(tenantId: string, data: SucursalData) {
    this.validar(data);
    if (data.valor_dolar != null) await this.validarDolarHeredado(tenantId, data);
    return this.repo.create(tenantId, data);
  }

  async update(id: string, tenantId: string, data: Partial<SucursalData>) {
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
    this.validar(data);

    if (data.valor_dolar !== undefined && (data.valor_dolar === null ? sucursal.valor_dolar != null : Number(data.valor_dolar) !== Number(sucursal.valor_dolar))) {
      await this.validarDolarHeredado(tenantId, data);
    }

    // Reactivar siempre se puede; desactivar pasa por las mismas reglas que la baja.
    if (data.activo === false && sucursal.activo) {
      await this.verificarPuedeDesactivar(id, tenantId, sucursal);
    }
    return this.repo.update(id, tenantId, data);
  }

  async desactivar(id: string, tenantId: string) {
    const sucursal = await this.repo.findById(id, tenantId);
    if (!sucursal) return null;
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
