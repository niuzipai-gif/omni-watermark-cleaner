import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

const externalPackages = ['electron'];
const externalBuiltins = new Set([...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)]);

function isExternal(id: string): boolean {
  return externalBuiltins.has(id) || externalPackages.some((packageName) => id === packageName || id.startsWith(`${packageName}/`));
}

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: false,
    lib: {
      entry: 'electron/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs'
    },
    rollupOptions: {
      external: isExternal
    }
  }
});
