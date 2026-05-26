import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  const runtimeTarget = process.env.VITE_RUNTIME_TARGET === 'electron' ? 'electron' : 'web'
  const enablePwa = runtimeTarget === 'web'

  const plugins = [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Bundle analyzer - generates stats.html on build
    visualizer({
      filename: 'stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ]

  if (enablePwa) {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          name: 'SwarmUI',
          short_name: 'SwarmUI',
          description: 'AI Image Generation Interface',
          theme_color: '#1b1b20',
          background_color: '#1b1b20',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /\/View\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'swarmui-images',
                expiration: {
                  maxEntries: 300,
                  maxAgeSeconds: 60 * 60 * 24 * 3,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/API\/ListModels.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'swarmui-model-list',
                expiration: {
                  maxEntries: 25,
                  maxAgeSeconds: 60 * 10,
                },
              },
            },
            {
              urlPattern: /\/Output\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'swarmui-output-images',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
          navigateFallback: 'offline.html',
          navigateFallbackDenylist: [/^\/API/, /^\/View/, /^\/Output/],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    )
  }

  return {
    plugins,
  base: './', // Use relative paths for Electron compatibility
  server: {
    port: 5173,
    proxy: {
      '/API': {
        target: 'http://localhost:7801',
        changeOrigin: true,
        ws: true,  // Enable WebSocket proxying
      },
      '/View': {
        target: 'http://localhost:7801',
        changeOrigin: true,
      },
      // ComfyUI Backend Direct - for ComfyUI iframe embedding
      '/ComfyBackendDirect': {
        target: 'http://localhost:7801',
        changeOrigin: true,
        ws: true,  // ComfyUI uses WebSockets
      },
      // Output folder - for ComfyUI generated images
      '/Output': {
        target: 'http://localhost:7801',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Enable source maps for debugging (disable in production if needed)
    sourcemap: false,
    // CSS code splitting
    cssCodeSplit: true,
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('framer-motion')) return 'vendor-framer';
          if (id.includes('@mantine/core')) return 'vendor-mantine-core';
          if (id.includes('@mantine/hooks')) return 'vendor-mantine-hooks';
          if (id.includes('@mantine/notifications') || id.includes('@mantine/form')) return 'vendor-mantine-extras';
          if (id.includes('@tabler/icons-react')) return 'vendor-icons';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (id.includes('zustand')) return 'vendor-zustand';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react-core';
          return undefined;
        },
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'],
  },
  }
})
