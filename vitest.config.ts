import { defineConfig } from 'vitest/config';
import { resolve } from 'pathe';

const currentDirectory = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(currentDirectory, 'src/main'),
      '@preload': resolve(currentDirectory, 'src/preload'),
      '@renderer': resolve(currentDirectory, 'src/renderer/src'),
      '@shared': resolve(currentDirectory, 'src/shared'),
    },
  },
  test: {
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules/**', '.claude/**', 'out/**', 'release/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main/index.ts',
        'src/main/electron-runtime.ts',
        'src/main/auth/msal-runtime.ts',
        'src/renderer/src/main.tsx',
        'src/renderer/src/global.d.ts',
        'src/renderer/src/interaction-plugin.ts',
        'src/renderer/src/event-editor-state.ts',
        'src/shared/duration.ts',
        'src/shared/ipc-types.ts',
        'src/shared/ipc-values.ts',
        'src/shared/schema-values.ts',
        'src/shared/exchange-auth.ts',
        'src/preload/**',
      ],
    },
  },
});
