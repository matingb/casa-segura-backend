import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Silenciar console.error por defecto en todos los tests para mantener la consola limpia.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
