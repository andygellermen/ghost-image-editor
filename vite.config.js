import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    writeBundle() {
      copyFileSync(resolve('src/manifest.json'), resolve('dist/manifest.json'));
    }
  };
}

export default defineConfig({
  plugins: [copyManifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: '.',
    rollupOptions: {
      input: {
        content: 'src/content.js',
        editor: 'src/editor.js',
        background: 'src/background.js'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]'
      }
    }
  }
});
