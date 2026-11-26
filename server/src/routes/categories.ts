import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q } from '../db.ts';
import { type AuthEnv, requireAdmin } from '../lib/auth.ts';
import { fail, parseId } from '../lib/http.ts';
import { iconName, slugify } from '../lib/text.ts';

// No defaults here: `.partial()` would re-apply them on PATCH and overwrite stored values.
const category = z.object({
  name: z.string().trim().min(1).max(40),
  icon: iconName,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort: z.number().int(),
  published: z.boolean(),
  /** Where the category is offered: places, recipes, or both. */
  applies_to: z.enum(['all', 'places', 'recipes']),
});
const newCategory = category.extend({
  icon: iconName.default('utensils'),
  color: category.shape.color.default('#D1382F'),
  sort: z.number().int().default(0),
  published: z.boolean().default(true),
  applies_to: category.shape.applies_to.default('all'),
});

export const categories = new Hono<AuthEnv>()
  .get('/', (c) =>
    c.json(
      q
        .all<{ published: number }>(
          `SELECT c.*,
             (SELECT count(*) FROM places p WHERE p.category_id = c.id AND p.published = 1) AS places,
             (SELECT count(*) FROM recipes r WHERE r.category_id = c.id AND r.published = 1) AS recipes
           FROM categories c ORDER BY sort, name`,
        )
        .map((row) => ({ ...row, published: Boolean(row.published) })),
    ),
  )

  .post('/', validate('json', newCategory), (c) => {
    requireAdmin(c);
    const body = c.req.valid('json');
    const slug = slugify(body.name);
    if (q.get('SELECT 1 FROM categories WHERE slug = ?', [slug])) fail(409, 'Cette catégorie existe déjà');
    const id = q.insert('INSERT INTO categories (slug, name, icon, color, sort, published, applies_to) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      slug,
      body.name,
      body.icon,
      body.color,
      body.sort,
      body.published ? 1 : 0,
      body.applies_to,
    ]);
    return c.json({ id, slug }, 201);
  })

  .patch('/:id', validate('json', category.partial()), (c) => {
    requireAdmin(c);
    const id = parseId(c.req.param('id'));
    const body = c.req.valid('json');
    const current = q.get<z.infer<typeof category>>(
      'SELECT name, icon, color, sort, published = 1 AS published, applies_to FROM categories WHERE id = ?',
      [id],
    );
    if (!current) fail(404, 'Catégorie introuvable');
    const next = { ...current, ...body };
    q.run('UPDATE categories SET name = ?, icon = ?, color = ?, sort = ?, published = ?, applies_to = ? WHERE id = ?', [
      next.name,
      next.icon,
      next.color,
      next.sort,
      next.published ? 1 : 0,
      next.applies_to,
      id,
    ]);
    return c.json({ ok: true });
  })

  .delete('/:id', (c) => {
    requireAdmin(c);
    q.run('DELETE FROM categories WHERE id = ?', [parseId(c.req.param('id'))]);
    return c.json({ ok: true });
  });
