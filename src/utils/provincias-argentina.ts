/** Jurisdicciones argentinas. Fuente: https://www.argentina.gob.ar/pais/provincias */
export const PROVINCIAS_ARGENTINAS = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  'Tucumán',
] as const;

function claveProvincia(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

const provinciasPorNombre = new Map<string, string>(PROVINCIAS_ARGENTINAS.map((nombre) => [claveProvincia(nombre), nombre]));
for (const alias of ['CABA', 'Capital Federal', 'Ciudad de Buenos Aires', 'Buenos Aires Ciudad']) {
  provinciasPorNombre.set(claveProvincia(alias), 'Ciudad Autónoma de Buenos Aires');
}
for (const alias of ['Bs As', 'BsAs', 'Provincia de Buenos Aires', 'Pcia de Buenos Aires']) {
  provinciasPorNombre.set(claveProvincia(alias), 'Buenos Aires');
}
provinciasPorNombre.set('tierra del fuego', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur');

/** null = sin especificar; undefined = valor que no identifica una provincia argentina. */
export function normalizarProvincia(valor: unknown): string | null | undefined {
  if (valor == null) return null;
  if (typeof valor !== 'string') return undefined;
  const clave = claveProvincia(valor);
  return clave === '' ? null : provinciasPorNombre.get(clave);
}
