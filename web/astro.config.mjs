import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte()],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  server: { port: 4321, host: true },
  vite: {
    worker: { format: 'es' },
    // Pre-bundle client libraries so the dev server never invalidates an open tab ("Outdated Optimize Dep").
    optimizeDeps: {
      include: [
        'maplibre-gl',
        'lucide',
        '@tiptap/core',
        '@tiptap/starter-kit',
        '@tiptap/extension-image',
        '@tiptap/extensions',
        '@tiptap/markdown',
        '@tiptap/extension-drag-handle',
        '@tiptap/extension-bubble-menu',
        '@tiptap/suggestion',
      ],
    },
    server: {
      proxy: {
        // xfwd keeps the browser's host in X-Forwarded-Host so the API's origin check passes.
        '/api': { target: apiTarget, xfwd: true },
        '/uploads': apiTarget,
      },
    },
  },
});
