import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const config = defineConfig({
  build: {
    license: false,
    chunkSizeWarningLimit: 500
  },
  server: {
    host: true,
    port: 3000
  },
  resolve: {
    tsconfigPaths: true
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
      spa: {
        enabled: true,
        prerender: {
          outputPath: '/index.html'
        }
      }
    }),
    react()
  ]
});

export default config;
