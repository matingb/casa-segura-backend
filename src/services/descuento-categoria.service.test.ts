import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DescuentoCategoriaService, resolverDescuento } from './descuento-categoria.service';
import { DescuentoCategoriaRepository } from '../repositories/descuento-categoria.repository';
import { TipoRepository } from '../repositories/tipo.repository';
import { SubtipoRepository } from '../repositories/subtipo.repository';
import { BusinessError } from '../utils/errors';

vi.mock('../repositories/descuento-categoria.repository');
vi.mock('../repositories/tipo.repository');
vi.mock('../repositories/subtipo.repository');

const SUC_A = 'suc-a';
const SUC_B = 'suc-b';

describe('resolverDescuento', () => {
  const sinNada = { descuentoGeneral: null, excepciones: [] };

  it('sin nada definido: no hay descuento', () => {
    expect(resolverDescuento(SUC_A, sinNada)).toEqual({ porcentaje: null, origen: 'sin-descuento' });
  });

  it('solo general de categoría: aplica a cualquier sucursal', () => {
    const cat = { descuentoGeneral: 10, excepciones: [] };
    expect(resolverDescuento(SUC_A, cat)).toEqual({ porcentaje: 10, origen: 'categoria' });
    expect(resolverDescuento(SUC_B, cat)).toEqual({ porcentaje: 10, origen: 'categoria' });
  });

  it('excepción de categoría: pisa al general solo en esa sucursal', () => {
    const cat = { descuentoGeneral: 10, excepciones: [{ sucursalId: SUC_B, porcentaje: 5 }] };
    expect(resolverDescuento(SUC_A, cat)).toEqual({ porcentaje: 10, origen: 'categoria' });
    expect(resolverDescuento(SUC_B, cat)).toEqual({ porcentaje: 5, origen: 'categoria-sucursal' });
  });

  it('el caso del pedido: 10% general, 5% en una sucursal y 0% en otra', () => {
    const cat = {
      descuentoGeneral: 10,
      excepciones: [
        { sucursalId: SUC_B, porcentaje: 5 },
        { sucursalId: 'suc-c', porcentaje: 0 },
      ],
    };
    expect(resolverDescuento(SUC_A, cat).porcentaje).toBe(10);
    expect(resolverDescuento(SUC_B, cat).porcentaje).toBe(5);
    expect(resolverDescuento('suc-c', cat).porcentaje).toBe(0);
  });

  it('la subcategoría gana sobre la categoría', () => {
    const cat = { descuentoGeneral: 10, excepciones: [] };
    const sub = { descuentoGeneral: 5, excepciones: [] };
    expect(resolverDescuento(SUC_A, cat, sub)).toEqual({ porcentaje: 5, origen: 'subcategoria' });
  });

  it('subcategoría sin descuento propio: hereda el de la categoría', () => {
    const cat = { descuentoGeneral: 10, excepciones: [] };
    expect(resolverDescuento(SUC_A, cat, sinNada)).toEqual({ porcentaje: 10, origen: 'categoria' });
  });

  it('la excepción de subcategoría es lo más específico y gana a todo', () => {
    const cat = { descuentoGeneral: 10, excepciones: [{ sucursalId: SUC_A, porcentaje: 8 }] };
    const sub = { descuentoGeneral: 5, excepciones: [{ sucursalId: SUC_A, porcentaje: 3 }] };
    expect(resolverDescuento(SUC_A, cat, sub)).toEqual({ porcentaje: 3, origen: 'subcategoria-sucursal' });
  });

  it('un 0 explícito es un descuento válido y no delega al nivel siguiente', () => {
    const cat = { descuentoGeneral: 10, excepciones: [] };
    const sub = { descuentoGeneral: 0, excepciones: [] };
    expect(resolverDescuento(SUC_A, cat, sub)).toEqual({ porcentaje: 0, origen: 'subcategoria' });
  });

  it('una excepción de subcategoría en 0 anula el descuento de la categoría en esa sucursal', () => {
    const cat = { descuentoGeneral: 20, excepciones: [] };
    const sub = { descuentoGeneral: null, excepciones: [{ sucursalId: SUC_B, porcentaje: 0 }] };
    expect(resolverDescuento(SUC_B, cat, sub).porcentaje).toBe(0);
    // en otra sucursal sigue valiendo el de la categoría
    expect(resolverDescuento(SUC_A, cat, sub).porcentaje).toBe(20);
  });
});

describe('DescuentoCategoriaService', () => {
  let service: DescuentoCategoriaService;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DescuentoCategoriaService();
    vi.mocked(TipoRepository.prototype.existeEnTenant).mockResolvedValue(true);
    vi.mocked(SubtipoRepository.prototype.existeEnTenant).mockResolvedValue(true);
    vi.mocked(DescuentoCategoriaRepository.prototype.sucursalPerteneceAlTenant).mockResolvedValue(true);
  });

  describe('setDescuentoGeneralTipo', () => {
    it('acepta un porcentaje válido', async () => {
      vi.mocked(TipoRepository.prototype.updateDescuentoGeneral).mockResolvedValue({ id: 't1' } as any);
      await service.setDescuentoGeneralTipo(TENANT, 't1', 15);
      expect(TipoRepository.prototype.updateDescuentoGeneral).toHaveBeenCalledWith(TENANT, 't1', 15);
    });

    it('acepta null para quitar el descuento', async () => {
      vi.mocked(TipoRepository.prototype.updateDescuentoGeneral).mockResolvedValue({ id: 't1' } as any);
      await service.setDescuentoGeneralTipo(TENANT, 't1', null);
      expect(TipoRepository.prototype.updateDescuentoGeneral).toHaveBeenCalledWith(TENANT, 't1', null);
    });

    it('rechaza un porcentaje fuera de rango', async () => {
      await expect(service.setDescuentoGeneralTipo(TENANT, 't1', 150)).rejects.toThrow(BusinessError);
      await expect(service.setDescuentoGeneralTipo(TENANT, 't1', -5)).rejects.toThrow(BusinessError);
      expect(TipoRepository.prototype.updateDescuentoGeneral).not.toHaveBeenCalled();
    });
  });

  describe('setExcepcion', () => {
    it('guarda la excepción para la sucursal', async () => {
      vi.mocked(DescuentoCategoriaRepository.prototype.upsert).mockResolvedValue({ id: 'd1' } as any);

      await service.setExcepcion(TENANT, { tipoId: 't1' }, SUC_A, 7.5);

      expect(DescuentoCategoriaRepository.prototype.upsert).toHaveBeenCalledWith({ tipoId: 't1' }, SUC_A, 7.5);
    });

    it('si la categoría no es del tenant: retorna null sin escribir', async () => {
      vi.mocked(TipoRepository.prototype.existeEnTenant).mockResolvedValue(false);

      const r = await service.setExcepcion(TENANT, { tipoId: 'ajeno' }, SUC_A, 10);

      expect(r).toBeNull();
      expect(DescuentoCategoriaRepository.prototype.upsert).not.toHaveBeenCalled();
    });

    it('si la sucursal no es del tenant: lanza BusinessError', async () => {
      vi.mocked(DescuentoCategoriaRepository.prototype.sucursalPerteneceAlTenant).mockResolvedValue(false);

      await expect(
        service.setExcepcion(TENANT, { tipoId: 't1' }, 'suc-ajena', 10)
      ).rejects.toThrow('La sucursal seleccionada no existe.');
      expect(DescuentoCategoriaRepository.prototype.upsert).not.toHaveBeenCalled();
    });

    it('rechaza un porcentaje inválido antes de tocar la base', async () => {
      await expect(
        service.setExcepcion(TENANT, { subtipoId: 's1' }, SUC_A, 120)
      ).rejects.toThrow(BusinessError);
      expect(DescuentoCategoriaRepository.prototype.upsert).not.toHaveBeenCalled();
    });
  });
});
