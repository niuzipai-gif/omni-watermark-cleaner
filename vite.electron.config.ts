import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const externalPackages = ['@pilio/gemini-watermark-remover', 'playwright', 'playwright-core', 'sharp', 'electron'];
const externalBuiltins = new Set([...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)]);

function isExternal(id: string): boolean {
  return externalBuiltins.has(id) || externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`));
}

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: true,
    lib: {
      entry: 'electron/main.ts',
      formats: ['es'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: isExternal
    }
  }
});
