import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    css: {
      transformer: 'postcss',
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/restaurante.db',
          '**/restaurante.db-wal',
          '**/restaurante.db-shm',
          '**/backup/**',
          '**/.env'
        ]
      }
      // 🔥 O bloco proxy foi EXCLUÍDO daqui para quebrar o loop!
    },
  };
});