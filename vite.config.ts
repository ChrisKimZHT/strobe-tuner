import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import zhCN from './src/locales/zh-CN.json';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: { ui: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'] },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'localized-html',
      transformIndexHtml(html) {
        return html
          .replaceAll('__APP_NAME__', escapeHtml(zhCN.app.name))
          .replaceAll('__APP_DESCRIPTION__', escapeHtml(zhCN.app.description));
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: zhCN.app.name,
        short_name: zhCN.app.name,
        description: zhCN.app.description,
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Includes the audio worklet and pitch worker for offline microphone use.
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
