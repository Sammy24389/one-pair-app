import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
import pkg from './package.json'

// BASE_PATH is set by the Pages workflow (e.g. "/onepair/"); Capacitor builds use relative paths.
const base = process.env.BASE_PATH || './'

export default defineConfig(({mode}) => ({
  base: mode === 'capacitor' ? './' : base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // No service worker inside the native app – assets ship in the APK.
      disable: mode === 'capacitor' || process.env.CAPACITOR === '1',
      manifest: {
        name: 'OnePair',
        short_name: 'OnePair',
        description: 'Private peer-to-peer space for best friends and couples',
        theme_color: '#e8577e',
        background_color: '#120d14',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable'}
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: id => {
          if (id.includes('node_modules/leaflet')) return 'leaflet'
          if (id.includes('node_modules/yjs') || id.includes('node_modules/y-indexeddb') || id.includes('node_modules/lib0')) return 'yjs'
          if (id.includes('node_modules/@trystero-p2p') || id.includes('node_modules/trystero')) return 'p2p'
          if (id.includes('node_modules/react')) return 'react'
        }
      }
    }
  }
}))
