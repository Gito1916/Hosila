import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'prompt',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
            manifest: {
                name: 'Hosila',
                short_name: 'Hosila',
                description: 'Hotel Property Management System',
                theme_color: '#21C29C',
                background_color: '#0f172a',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Split vendor libraries into separate chunks for better caching
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-supabase': ['@supabase/supabase-js', '@tanstack/react-query'],
                    'vendor-ui': ['lucide-react', 'date-fns'],
                    'vendor-utils': ['uuid', 'bcryptjs', 'react-hook-form', 'zustand'],
                }
            }
        },
        // Increase chunk size warning limit since we're splitting intentionally
        chunkSizeWarningLimit: 300,
        // Enable source maps for production debugging (optional)
        sourcemap: false,
        // Minification settings
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Remove console.logs in production
                drop_debugger: true
            }
        }
    },
    server: {
        host: true
    }
})
