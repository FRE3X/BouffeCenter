import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { etag } from 'hono/etag';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { config } from './config.ts';
import { type AuthEnv, loadUser } from './lib/auth.ts';
import { apiKeys } from './routes/apiKeys.ts';
import { auth } from './routes/auth.ts';
import { backup } from './routes/backup.ts';
import { categories } from './routes/categories.ts';
import { images } from './routes/images.ts';
import { integrations } from './routes/integrations.ts';
import { places } from './routes/places.ts';
import { planning } from './routes/planning.ts';
import { products } from './routes/products.ts';
import { recipes } from './routes/recipes.ts';
import { settings } from './routes/settings.ts';
import { tags } from './routes/tags.ts';
import { users } from './routes/users.ts';

const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const api = new Hono<AuthEnv>()
  .use(corsOrigins.length ? cors({ origin: corsOrigins, credentials: true }) : (_, next) => next())
  .use(loadUser)
  // Cookie-authenticated writes must come from our own origin; bearer-token clients (mobile, MCP) are exempt.
  .use(async (c, next) => {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    const bearer = c.req.header('authorization')?.startsWith('Bearer ');
    const origin = c.req.header('origin');
    if (unsafe && !bearer && origin) {
      const allowedHosts = [c.req.header('x-forwarded-host'), c.req.header('host'), new URL(config.publicUrl).host];
      if (!allowedHosts.includes(new URL(origin).host) && !corsOrigins.includes(origin)) {
        return c.json({ error: 'Origine refusée' }, 403);
      }
    }
    await next();
  })
  // Mounted before etag(): it would buffer the whole archive in memory to hash it.
  .route('/backup', backup)
  .use(etag())
  .get('/', (c) =>
    c.json({
      name: 'bouffe-center',
      version: 1,
      endpoints: [
        'GET /api/places/geojson',
        'GET /api/places?q=&category=&tag=',
        'GET /api/places/:idOrSlug',
        'GET /api/recipes?q=&category=&tag=a,b (tous les tags requis)&limit=&offset=',
        'GET /api/recipes/:idOrSlug',
        'PUT /api/recipes/:id/products { product_ids } (auteur ou admin ; produits conseillés et accords mets-vins)',
        'GET /api/products?kind=pantry|wine (sans kind : toutes les sections visibles)&q=&category=&tag=&in_stock=1&limit=&offset= (quantity et in_stock réservés aux membres)',
        'GET /api/products/:idOrSlug',
        'POST /api/products { kind, name, … } · PATCH /api/products/:id · DELETE /api/products/:id (membre ; auteur ou admin pour modifier)',
        'PUT /api/products/:id/stock { quantity } | { delta } (membre ; stock commun, jamais sous 0)',
        'GET /api/products/lookup?barcode=|q= (membre ; recherche Open Food Facts)',
        'POST /api/products/:id/import-image { url } (membre ; photo Open Food Facts)',
        'GET /api/products/wine-lookup?q= · GET /api/products/wine-lookup/:id (membre ; GrapeMinds, si une clé est configurée)',
        'GET /api/categories',
        'GET /api/tags?kind=place|recipe|product|wine',
        'GET /api/planning?week=YYYY-MM-DD',
        'GET /api/planning/shopping?week=YYYY-MM-DD (membre ; produits à 0 liés aux recettes de la semaine)',
        'PUT /api/planning/:date/:meal { recipe_ids } (membre ; meal = breakfast|lunch|dinner)',
        'GET /api/settings',
        'PATCH /api/settings { map_private, recipes_private, planning_private, products_private, cellar_private, products_enabled, cellar_enabled } (admin ; une section privée répond 401 aux visiteurs, une section désactivée 404)',
        'GET /api/integrations/grapeminds · PUT { api_key } · DELETE · POST /api/integrations/grapeminds/test (admin ; la clé n\'est jamais renvoyée)',
        'POST /api/auth/login',
        'GET /api/api-keys?all=true (membre ; all = toutes les clés, admin)',
        'POST /api/api-keys { name, expires_in_days: 1-3650 | null } (membre ; la clé n\'est renvoyée qu\'une fois)',
        'DELETE /api/api-keys/:id (propriétaire ou admin)',
        'GET /api/backup (admin) : sauvegarde .tar.gz (base SQLite + photos)',
        'POST /api/backup (admin, session) : restaure une sauvegarde .tar.gz envoyée en corps brut, remplace tout le contenu',
      ],
    }),
  )
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', auth)
  .route('/api-keys', apiKeys)
  .route('/users', users)
  .route('/categories', categories)
  .route('/tags', tags)
  .route('/places', places)
  .route('/recipes', recipes)
  .route('/images', images)
  .route('/planning', planning)
  .route('/products', products)
  .route('/integrations', integrations)
  .route('/settings', settings);

export const app = new Hono()
  .route('/api', api)
  .use(
    '/uploads/*',
    serveStatic({
      root: path.relative(process.cwd(), config.uploadDir),
      rewriteRequestPath: (p) => p.replace(/^\/uploads/, ''),
      onFound: (_, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  )
  .notFound((c) => c.json({ error: 'Introuvable' }, 404))
  .onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Erreur serveur' }, 500);
  });

export type AppType = typeof api;
