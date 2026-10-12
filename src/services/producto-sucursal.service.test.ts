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

describe('validarMargenMinimoConfiguracion con costo y precio en USD', () => {
  it('compara en USD sin depender del redondeo de los equivalentes', () => {
    expect(() => validarMargenMinimoConfiguracion({
      costo_reposicion: 12345.68, precio_venta_ars: 13580.25, margen_minimo: 10,
      costo_usd: '10.0000', precio_venta_usd_principal: '11.0000',
    })).not.toThrow();
    expect(() => validarMargenMinimoConfiguracion({
      costo_reposicion: 12000, precio_venta_ars: 13200, margen_minimo: 10,
      costo_usd: '10.0000', precio_venta_usd_principal: '10.9999',
    })).toThrow(BusinessError);
  });
});
