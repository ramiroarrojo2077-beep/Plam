import { defineConfig } from 'vite';

// dev.html es la entrada de desarrollo (código fuente). El index.html de la raíz es el
// juego completo en un solo archivo, generado con `npm run build:html`.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: 'dev.html' },
  },
  server: { host: true, open: '/dev.html' },
});
