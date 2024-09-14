import { defineConfig } from 'vite'

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist/public',
    rollupOptions: {
      input: 'public/index.html'
    }
  }
})
