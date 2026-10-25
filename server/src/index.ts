import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import compression from 'compression';
import { getRequestListener } from '@hono/node-server';
import { config } from './config.ts';
import { app } from './app.ts';
import { bootstrapAdmin } from './lib/auth.ts';
import { cleanBackupTmp } from './lib/backup.ts';
import { seedIfEmpty } from './seed.ts';

await cleanBackupTmp();
await bootstrapAdmin();
await seedIfEmpty();

const apiListener = getRequestListener(app.fetch);

// Astro SSR pages call the API in-process instead of over HTTP (see web/src/lib/api.ts).
(globalThis as { __bouffeCenterFetch?: typeof app.fetch }).__bouffeCenterFetch = app.fetch;

type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
let webHandler: NodeHandler | undefined;
const webEntry = path.join(config.webDist, 'server/entry.mjs');
// In dev the front-end runs on `astro dev`; never mount (or watch) a stale production build there.
if (process.env.SERVE_WEB !== 'false' && fs.existsSync(webEntry)) {
  process.env.ASTRO_NODE_AUTOSTART = 'disabled';
  webHandler = (await import(webEntry)).handler as NodeHandler;
} else {
  console.log('[bouffe-center] no web build found, serving API only (run `astro dev` for the front-end)');
}

// Gzip/brotli for HTML, JSON, JS and CSS; images are already compressed WebP.
const compress = compression({ threshold: 1024 }) as unknown as (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void,
) => void;

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  compress(req, res, () => {
    if (!webHandler || url.startsWith('/api/') || url === '/api' || url.startsWith('/uploads/')) {
      return apiListener(req, res);
    }
    webHandler(req, res);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`[bouffe-center] listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
