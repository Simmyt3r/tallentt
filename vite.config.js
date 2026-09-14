import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'ChombuTar',
        short_name: 'ChombuTar',
        description: 'Own your spotlight — talent marketplace with escrow',
        theme_color: '#0A13E6',
        background_color: '#F7F3EB',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Cloudinary images — photos, avatars, and the video "poster"
            // stills requested via cldVideoPoster() in src/lib/cloudinary.js
            // (a /video/upload/ URL that ends in .jpg, not an actual video
            // file). Deliberately excludes real video/audio: Workbox's plain
            // CacheFirst here has no HTTP Range support, so caching a whole
            // video file can break seeking/scrubbing and just fills up the
            // client's storage quota for no benefit — the browser's native
            // HTTP cache and Cloudinary's own CDN already handle range
            // requests correctly, so video is left to them.
            urlPattern: ({ url }) =>
              url.hostname === 'res.cloudinary.com' && !/\.(mp4|webm|mov|m3u8|ts)(\?.*)?$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'unsplash', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})