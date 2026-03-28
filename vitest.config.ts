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
});
