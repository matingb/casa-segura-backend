import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_KEY: 'test-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-role-key',
    },
    restoreMocks: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
