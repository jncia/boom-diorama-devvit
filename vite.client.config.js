import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'src/client',
  base: './',
  build: {
    target: 'es2020',
    outDir: resolve(process.cwd(), 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(process.cwd(), 'src/client/index.html'),
    },
  },
})
