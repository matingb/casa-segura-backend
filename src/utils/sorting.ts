export type SortDir = 'asc' | 'desc';

export interface SortCriterion {
  sortBy: string;
  sortDir: SortDir;
}

/**
 * Arma una cláusula ORDER BY segura a partir de un whitelist de columnas ordenables.
 * `sortableColumns` mapea la clave que manda el frontend (ej. "nombre") a la
 * expresión SQL real (ej. "p.nombre"), evitando interpolar el nombre de columna
 * directamente desde el input del usuario.
 *
 * Soporta múltiples criterios de orden (multi-sort): se aplican en el orden
 * recibido, cada uno como desempate del anterior.
 */
export function buildOrderByClause(
  sortBy: string | undefined,
  sortDir: string | undefined,
  sortableColumns: Record<string, string>,
  defaultOrderBy: string
): string {
  if (!sortBy || !(sortBy in sortableColumns)) {
    return defaultOrderBy;
  }
  const column = sortableColumns[sortBy];
  const direction: SortDir = sortDir === 'desc' ? 'desc' : 'asc';
  return `${column} ${direction.toUpperCase()}`;
}

/**
 * Variante multi-columna de buildOrderByClause. Recibe la lista de criterios
 * ya parseada (ver parseSortParam) y arma "col1 ASC, col2 DESC, ...",
 * filtrando cualquier sortBy que no esté en el whitelist.
 */
export function buildMultiOrderByClause(
  criteria: SortCriterion[],
  sortableColumns: Record<string, string>,
  defaultOrderBy: string
): string {
  const valid = criteria.filter((c) => c.sortBy in sortableColumns);
  if (valid.length === 0) {
    return defaultOrderBy;
  }
  return valid
    .map((c) => `${sortableColumns[c.sortBy]} ${c.sortDir.toUpperCase()}`)
    .join(', ');
}

/**
 * Parsea los query params `sortBy`/`sortDir` que el frontend manda como
 * listas separadas por coma (ej. sortBy=nombre,precio&sortDir=asc,desc) en
 * una lista de criterios ordenados. Si las longitudes no coinciden, cada
 * sortBy sin dirección explícita asume 'asc'.
 */
export function parseSortParam(sortBy?: string, sortDir?: string): SortCriterion[] {
  if (!sortBy) return [];
  const byParts = sortBy.split(',').map((s) => s.trim()).filter(Boolean);
  const dirParts = (sortDir ?? '').split(',').map((s) => s.trim());
  return byParts.map((sortByPart, i) => ({
    sortBy: sortByPart,
    sortDir: dirParts[i] === 'desc' ? 'desc' : 'asc',
  }));
}
