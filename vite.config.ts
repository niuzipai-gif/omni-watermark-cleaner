/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    setupFiles: ['./src/test/setup.ts']
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true
  }
} as Parameters<typeof defineConfig>[0]);
