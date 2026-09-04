import { describe, expect, it } from 'vitest';
import { BusinessError } from '../utils/errors';
import { validarMargenMinimoConfiguracion } from './producto-sucursal.service';

describe('validarMargenMinimoConfiguracion', () => {
  it('acepta un precio de venta que alcanza el margen configurado', () => {
    expect(() => validarMargenMinimoConfiguracion({
      costo_reposicion: 100,
      precio_venta_ars: 130,
      margen_minimo: 30,
    })).not.toThrow();
  });

  it('rechaza persistir un precio de venta por debajo del margen minimo', () => {
    expect(() => validarMargenMinimoConfiguracion({
      costo_reposicion: 100,
      precio_venta_ars: 129.99,
      margen_minimo: 30,
    })).toThrow(BusinessError);
  });

  it('no agrega una restriccion cuando no hay margen configurado', () => {
    expect(() => validarMargenMinimoConfiguracion({
      costo_reposicion: 100,
      precio_venta_ars: 80,
      margen_minimo: null,
    })).not.toThrow();
  });
});
