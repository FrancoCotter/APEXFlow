import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const httpsEnabled = process.env.APEXFLOW_HTTPS === 'true';
  const certPath = process.env.APEXFLOW_HTTPS_CERT || path.resolve(__dirname, 'certs/local/apexflow-cert.pem');
  const keyPath = process.env.APEXFLOW_HTTPS_KEY || path.resolve(__dirname, 'certs/local/apexflow-key.pem');

  if (httpsEnabled && (!fs.existsSync(certPath) || !fs.existsSync(keyPath))) {
    throw new Error('HTTPS was requested, but the APEXFlow certificate is missing. Run enable-https first.');
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      https: httpsEnabled ? {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      } : undefined,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/audio': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/covers': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/editor': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/blog': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/demucs-web': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GENERATION_TIMEOUT_MS': JSON.stringify(env.GENERATION_TIMEOUT_MS || '1800000')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
