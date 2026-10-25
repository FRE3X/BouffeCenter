import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { config } from '../config.ts';
import { q, tx } from '../db.ts';
import { type AuthEnv, requireUser } from '../lib/auth.ts';
import { serializeImage } from '../lib/content.ts';
import { fail } from '../lib/http.ts';
import { processImage, removeImageFiles } from '../lib/images.ts';

const kind = z.enum(['place', 'recipe', 'product']);

function getImage(id: string) {
  const row = q.get<Parameters<typeof serializeImage>[0] & { kind: string; owner_id: number }>(
    'SELECT i.*, u.pseudo FROM images i LEFT JOIN users u ON u.id = i.user_id WHERE i.id = ?',
    [id],
  );
  if (!row) fail(404, 'Image introuvable');
  return row;
}

export const images = new Hono<AuthEnv>()
  /**
   * multipart/form-data: file, kind (place|recipe|product), owner_id, alt?, in_gallery? ("false" for inline editor images).
   * Any member may add photos to any place or recipe; photos are credited to the uploader.
   */
  .post('/', async (c) => {
    const user = requireUser(c);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) fail(400, 'Fichier manquant');
    if (file.size > config.maxUploadBytes) fail(413, 'Image trop lourde');
    const k = kind.safeParse(form.get('kind'));
    if (!k.success) fail(400, 'kind invalide');
    const ownerId = Number(form.get('owner_id'));
    const table = ({ place: 'places', recipe: 'recipes', product: 'products' } as const)[k.data];
    if (!q.get(`SELECT 1 FROM ${table} WHERE id = ?`, [ownerId])) fail(404, 'Contenu introuvable');

    let processed;
    try {
      processed = await processImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      fail(400, 'Format d’image non supporté');
    }
    const position =
      q.get<{ p: number }>('SELECT coalesce(max(position), -1) + 1 AS p FROM images WHERE kind = ? AND owner_id = ?', [k.data, ownerId])!.p;
    q.run(
      'INSERT INTO images (id, kind, owner_id, user_id, width, height, alt, position, in_gallery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        processed.id,
        k.data,
        ownerId,
        user.id,
        processed.width,
        processed.height,
        String(form.get('alt') ?? '').slice(0, 300),
        position,
        form.get('in_gallery') === 'false' ? 0 : 1,
      ],
    );
    return c.json(serializeImage(getImage(processed.id)), 201);
  })

  .patch('/:id', validate('json', z.object({ alt: z.string().max(300) })), (c) => {
    const user = requireUser(c);
    const image = getImage(c.req.param('id'));
    if (user.role !== 'admin' && image.user_id !== user.id) fail(403, 'Vous n’êtes pas l’auteur de cette photo');
    q.run('UPDATE images SET alt = ? WHERE id = ?', [c.req.valid('json').alt, image.id]);
    return c.json(serializeImage(getImage(image.id)));
  })

  /** Body: ordered list of image ids belonging to the same owner. */
  .post('/reorder', validate('json', z.object({ ids: z.array(z.string()).max(200) })), (c) => {
    requireUser(c);
    const { ids } = c.req.valid('json');
    tx(() => ids.forEach((id, position) => q.run('UPDATE images SET position = ? WHERE id = ?', [position, id])));
    return c.json({ ok: true });
  })

  .delete('/:id', async (c) => {
    const user = requireUser(c);
    const image = getImage(c.req.param('id'));
    if (user.role !== 'admin' && image.user_id !== user.id) fail(403, 'Vous n’êtes pas l’auteur de cette photo');
    tx(() => {
      q.run('DELETE FROM images WHERE id = ?', [image.id]);
      q.run('UPDATE recipes SET cover_image_id = NULL WHERE cover_image_id = ?', [image.id]);
      q.run('UPDATE products SET cover_image_id = NULL WHERE cover_image_id = ?', [image.id]);
    });
    await removeImageFiles(image.id);
    return c.json({ ok: true });
  });
