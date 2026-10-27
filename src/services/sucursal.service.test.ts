import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SucursalService } from './sucursal.service';
import { SucursalRepository } from '../repositories/sucursal.repository';
import { BusinessError } from '../utils/errors';
import { CotizacionRepository } from '../repositories/cotizacion.repository';

vi.mock('../repositories/sucursal.repository');
vi.mock('../repositories/cotizacion.repository');

describe('SucursalService', () => {
  let service: SucursalService;
  const TENANT = 'tenant-1';
  const AUTH = 'auth-1';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CotizacionRepository.prototype.obtener).mockResolvedValue({ cotizacion_usd_ars: null, cotizacion_version: '0', actualizada_at: null });
    service = new SucursalService();
    vi.mocked(SucursalRepository.prototype.contarActivas).mockResolvedValue(3);
    vi.mocked(SucursalRepository.prototype.estaAsignado).mockResolvedValue(true);
    vi.mocked(SucursalRepository.prototype.esAdministrador).mockResolvedValue(true);
  });

  describe('create', () => {
    it('solo un administrador puede crear sucursales', async () => {
      vi.mocked(SucursalRepository.prototype.esAdministrador).mockResolvedValue(false);

      await expect(service.create(TENANT, { nombre: 'Sur' }, AUTH)).rejects.toMatchObject({ status: 403, code: 'SIN_PERMISO' });
      expect(SucursalRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('impide cargar un dólar por sucursal cuando existe referencia central', async () => {
      vi.mocked(CotizacionRepository.prototype.obtener).mockResolvedValue({ cotizacion_usd_ars: '1200.000000', cotizacion_version: '1', actualizada_at: null });
      await expect(service.create(TENANT, { nombre: 'Sur', valor_dolar: 1300 }, AUTH)).rejects.toThrow('El dólar se configura para toda la empresa');
      expect(SucursalRepository.prototype.create).not.toHaveBeenCalled();
    });
    it('crea con los datos validados', async () => {
      vi.mocked(SucursalRepository.prototype.create).mockResolvedValue({ id: 's1' } as any);

      await service.create(TENANT, { nombre: 'Sucursal Sur', valor_dolar: 1200, descuento: 5 }, AUTH);

      expect(SucursalRepository.prototype.create).toHaveBeenCalledWith(TENANT, {
        nombre: 'Sucursal Sur',
        valor_dolar: 1200,
        descuento: 5,
      }, AUTH, undefined);
    });

    it('rechaza nombre vacío', async () => {
      await expect(service.create(TENANT, { nombre: '   ' }, AUTH)).rejects.toThrow(
        'El nombre de la sucursal es obligatorio.'
      );
      expect(SucursalRepository.prototype.create).not.toHaveBeenCalled();
    });

    it('rechaza un valor del dólar negativo', async () => {
      await expect(
        service.create(TENANT, { nombre: 'Sur', valor_dolar: -10 }, AUTH)
      ).rejects.toThrow('El valor del dólar debe ser un número positivo.');
    });

    it('rechaza un descuento fuera de rango', async () => {
      await expect(
        service.create(TENANT, { nombre: 'Sur', descuento: 150 }, AUTH)
      ).rejects.toThrow('El descuento debe ser un porcentaje entre 0 y 100.');
    });

    it('acepta descuento y valor del dólar nulos', async () => {
      vi.mocked(SucursalRepository.prototype.create).mockResolvedValue({ id: 's1' } as any);

      await expect(
        service.create(TENANT, { nombre: 'Sur', descuento: null, valor_dolar: null }, AUTH)
      ).resolves.toBeTruthy();
    });
  });

  describe('update', () => {
    it('si no existe: retorna null sin actualizar', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue(null);

      const r = await service.update('x', TENANT, { nombre: 'Nueva' }, AUTH);

      expect(r).toBeNull();
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('actualiza una sucursal existente', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({ id: 's1', activo: true } as any);
      vi.mocked(SucursalRepository.prototype.update).mockResolvedValue({ id: 's1' } as any);

      await service.update('s1', TENANT, { descuento: 8 }, AUTH);

      expect(SucursalRepository.prototype.update).toHaveBeenCalledWith('s1', TENANT, { descuento: 8 }, undefined);
    });

    it('rechaza con 403 si el usuario no está asignado a la sucursal', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({ id: 's1', activo: true } as any);
      vi.mocked(SucursalRepository.prototype.estaAsignado).mockResolvedValue(false);

      await expect(service.update('s1', TENANT, { descuento: 8 }, AUTH)).rejects.toMatchObject({
        status: 403,
        code: 'SUCURSAL_NO_ASIGNADA',
      });
      expect(SucursalRepository.prototype.estaAsignado).toHaveBeenCalledWith('s1', AUTH);
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('reactivar también exige estar asignado', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({ id: 's1', activo: false } as any);
      vi.mocked(SucursalRepository.prototype.estaAsignado).mockResolvedValue(false);

      await expect(service.update('s1', TENANT, { activo: true }, AUTH)).rejects.toThrow(
        'No estás asignado a esta sucursal'
      );
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('reactivar no pasa por las reglas de baja', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: false,
        es_central: true,
      } as any);
      vi.mocked(SucursalRepository.prototype.update).mockResolvedValue({ id: 's1' } as any);

      await expect(service.update('s1', TENANT, { activo: true }, AUTH)).resolves.toBeTruthy();
    });

    it('desactivar por update respeta la regla de la casa central', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: true,
        es_central: true,
      } as any);

      await expect(service.update('s1', TENANT, { activo: false }, AUTH)).rejects.toThrow(
        'No se puede dar de baja la casa central. Designá otra sucursal como central primero.'
      );
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });
  });

  describe('asignación de usuarios', () => {
    const YO = { id: 'u-yo', nombre: 'Yo', email: null, es_actual: true };
    const OTRO = { id: 'u-otro', nombre: 'Otro', email: null, es_actual: false };
    const ADMIN = { id: 'rol-admin', nombre: 'Administrador' };
    const VENDEDOR = { id: 'rol-vend', nombre: 'Vendedor' };

    beforeEach(() => {
      vi.mocked(SucursalRepository.prototype.esAdministrador).mockResolvedValue(true);
      vi.mocked(SucursalRepository.prototype.findUsuariosDelTenant).mockResolvedValue([YO, OTRO]);
      vi.mocked(SucursalRepository.prototype.findRolesDelTenant).mockResolvedValue([ADMIN, VENDEDOR]);
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({ id: 's1', activo: true } as any);
      vi.mocked(SucursalRepository.prototype.findUsuariosAsignados).mockResolvedValue([
        { usuario_id: YO.id, id_rol: ADMIN.id, es_actual: true },
      ]);
      vi.mocked(SucursalRepository.prototype.update).mockResolvedValue({ id: 's1' } as any);
      vi.mocked(SucursalRepository.prototype.create).mockResolvedValue({ id: 's1' } as any);
    });

    it('al editar, pasa la lista completa al repositorio', async () => {
      const usuarios = [
        { usuario_id: YO.id, id_rol: ADMIN.id },
        { usuario_id: OTRO.id, id_rol: VENDEDOR.id },
      ];
      await service.update('s1', TENANT, { nombre: 'Sur', usuarios }, AUTH);

      expect(SucursalRepository.prototype.update).toHaveBeenCalledWith('s1', TENANT, { nombre: 'Sur' }, usuarios);
    });

    it('solo un administrador puede asignar', async () => {
      vi.mocked(SucursalRepository.prototype.esAdministrador).mockResolvedValue(false);

      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: YO.id, id_rol: ADMIN.id }] }, AUTH)
      ).rejects.toMatchObject({ status: 403, code: 'SIN_PERMISO' });
      expect(SucursalRepository.prototype.update).not.toHaveBeenCalled();
    });

    it('nadie puede quitarse a sí mismo', async () => {
      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: OTRO.id, id_rol: ADMIN.id }] }, AUTH)
      ).rejects.toThrow('No podés quitarte de una sucursal');
    });

    it('nadie puede cambiarse su propio rol', async () => {
      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: YO.id, id_rol: VENDEDOR.id }] }, AUTH)
      ).rejects.toThrow('No podés cambiar tu propio rol');
    });

    it('rechaza usuarios o roles que no son del tenant', async () => {
      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: YO.id, id_rol: ADMIN.id }, { usuario_id: 'ajeno', id_rol: ADMIN.id }] }, AUTH)
      ).rejects.toThrow('Alguno de los usuarios elegidos no existe o está inactivo.');
      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: YO.id, id_rol: ADMIN.id }, { usuario_id: OTRO.id, id_rol: 'rol-ajeno' }] }, AUTH)
      ).rejects.toThrow('Alguno de los roles elegidos no existe.');
    });

    it('rechaza un usuario repetido', async () => {
      await expect(
        service.update('s1', TENANT, { usuarios: [{ usuario_id: YO.id, id_rol: ADMIN.id }, { usuario_id: YO.id, id_rol: ADMIN.id }] }, AUTH)
      ).rejects.toThrow('Un usuario no puede estar asignado dos veces');
    });

    it('al crear, agrega a quien crea como Administrador', async () => {
      await service.create(TENANT, { nombre: 'Sur', usuarios: [{ usuario_id: OTRO.id, id_rol: VENDEDOR.id }] }, AUTH);

      expect(SucursalRepository.prototype.create).toHaveBeenCalledWith(TENANT, { nombre: 'Sur' }, AUTH, [
        { usuario_id: OTRO.id, id_rol: VENDEDOR.id },
        { usuario_id: YO.id, id_rol: ADMIN.id },
      ]);
    });
  });

  describe('desactivar', () => {
    it('da de baja una sucursal común', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's2',
        activo: true,
        es_central: false,
      } as any);
      vi.mocked(SucursalRepository.prototype.desactivar).mockResolvedValue({ id: 's2', activo: false } as any);

      const r = await service.desactivar('s2', TENANT, AUTH);

      expect(r).toMatchObject({ activo: false });
    });

    it('no permite dar de baja una sucursal a la que no está asignado', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's2',
        activo: true,
        es_central: false,
      } as any);
      vi.mocked(SucursalRepository.prototype.estaAsignado).mockResolvedValue(false);

      await expect(service.desactivar('s2', TENANT, AUTH)).rejects.toMatchObject({ status: 403 });
      expect(SucursalRepository.prototype.desactivar).not.toHaveBeenCalled();
    });

    it('no permite dar de baja la casa central', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's1',
        activo: true,
        es_central: true,
      } as any);

      await expect(service.desactivar('s1', TENANT, AUTH)).rejects.toThrow(BusinessError);
      expect(SucursalRepository.prototype.desactivar).not.toHaveBeenCalled();
    });

    it('no permite dejar al tenant sin sucursales activas', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's2',
        activo: true,
        es_central: false,
      } as any);
      vi.mocked(SucursalRepository.prototype.contarActivas).mockResolvedValue(1);

      await expect(service.desactivar('s2', TENANT, AUTH)).rejects.toThrow(
        'No se puede dar de baja la única sucursal activa.'
      );
    });

    it('si ya estaba inactiva: no vuelve a escribir', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue({
        id: 's3',
        activo: false,
        es_central: false,
      } as any);

      const r = await service.desactivar('s3', TENANT, AUTH);

      expect(r).toMatchObject({ activo: false });
      expect(SucursalRepository.prototype.desactivar).not.toHaveBeenCalled();
    });

    it('si no existe: retorna null', async () => {
      vi.mocked(SucursalRepository.prototype.findById).mockResolvedValue(null);

      expect(await service.desactivar('x', TENANT, AUTH)).toBeNull();
    });
  });
});
