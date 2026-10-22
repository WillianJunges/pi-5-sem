import { defineConfig } from 'vitest/config';

/** Modelos do fluxo online são testados sem simular GPS, SQLite ou um aparelho real. */
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
