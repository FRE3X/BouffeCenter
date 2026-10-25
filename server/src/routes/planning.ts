import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../lib/validate.ts';
import { q, tx } from '../db.ts';
import { type AuthEnv, requireUser } from '../lib/auth.ts';
import { addDays, isValidDate, mondayOf, today } from '../lib/dates.ts';
import { fail } from '../lib/http.ts';
import { assertSectionVisible } from '../lib/settings.ts';
import { PRODUCT_SELECT, type ProductRow, serializeProductCard } from './products.ts';
import { type RecipeRow, SELECT, serializeCard } from './recipes.ts';

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
type Meal = (typeof MEALS)[number];
type Card = ReturnType<typeof serializeCard>;

const weekQuery = z.object({
  week: z.string().refine(isValidDate, 'Date invalide (AAAA-MM-JJ)').optional(),
});

const slotParams = z.object({
  date: z.string().refine(isValidDate, 'Date invalide (AAAA-MM-JJ)'),
  meal: z.enum(MEALS, 'Repas invalide (breakfast, lunch ou dinner)'),
});

const slotInput = z.object({
  recipe_ids: z.array(z.number().int().positive()).max(6, '6 recettes maximum par repas'),
});

type EntryRow = RecipeRow & { plan_date: string; plan_meal: Meal };

function entries(from: string, to: string, publishedOnly: boolean, meal?: Meal) {
  const where = ['m.date BETWEEN ? AND ?'];
  const params: string[] = [from, to];
  if (meal) {
    where.push('m.meal = ?');
    params.push(meal);
  }
  if (publishedOnly) where.push('r.published = 1');
  return q.all<EntryRow>(
    `${SELECT.replace('SELECT r.*', 'SELECT m.date AS plan_date, m.meal AS plan_meal, r.*')}
     JOIN meal_plan m ON m.recipe_id = r.id
     WHERE ${where.join(' AND ')}
     ORDER BY m.date, m.meal, m.position, m.id`,
    params,
  );
}

export const planning = new Hono<AuthEnv>()
  .get('/', validate('query', weekQuery), (c) => {
    const user = c.get('user');
    assertSectionVisible(user, 'planning');
    const current = today();
    const week = mondayOf(c.req.valid('query').week ?? current);
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: addDays(week, i),
      meals: { breakfast: [] as Card[], lunch: [] as Card[], dinner: [] as Card[] },
    }));
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const row of entries(week, addDays(week, 6), !user)) {
      byDate.get(row.plan_date)?.meals[row.plan_meal].push(serializeCard(row));
    }
    if (!user) c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=600');
    return c.json({ week, prev: addDays(week, -7), next: addDays(week, 7), today: current, days });
  })

  /** Shopping list: out-of-stock products linked to the recipes planned this week (members only). */
  .get('/shopping', validate('query', weekQuery), (c) => {
    requireUser(c);
    const week = mondayOf(c.req.valid('query').week ?? today());
    const range = [week, addDays(week, 6)];
    const rows = q.all<ProductRow>(
      `${PRODUCT_SELECT}
       WHERE p.quantity = 0 AND p.id IN (
         SELECT rp.product_id FROM meal_plan m JOIN recipe_products rp ON rp.recipe_id = m.recipe_id WHERE m.date BETWEEN ? AND ?)
       ORDER BY p.kind, p.name COLLATE NOCASE`,
      range,
    );
    const uses = q.all<{ product_id: number; id: number; slug: string; title: string }>(
      `SELECT DISTINCT rp.product_id, r.id, r.slug, r.title
       FROM meal_plan m JOIN recipe_products rp ON rp.recipe_id = m.recipe_id JOIN recipes r ON r.id = m.recipe_id
       WHERE m.date BETWEEN ? AND ? ORDER BY r.title COLLATE NOCASE`,
      range,
    );
    return c.json({
      week,
      items: rows.map((row) => ({
        ...serializeProductCard(row, true),
        recipes: uses.filter((u) => u.product_id === row.id).map(({ product_id: _, ...r }) => r),
      })),
    });
  })

  .put('/:date/:meal', validate('param', slotParams), validate('json', slotInput), (c) => {
    const user = requireUser(c);
    const { date, meal } = c.req.valid('param');
    const ids = [...new Set(c.req.valid('json').recipe_ids)];
    if (ids.length) {
      const found = q.get<{ n: number }>(
        `SELECT count(*) AS n FROM recipes WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      )!.n;
      if (found !== ids.length) fail(400, 'Recette introuvable');
    }
    tx(() => {
      q.run('DELETE FROM meal_plan WHERE date = ? AND meal = ?', [date, meal]);
      ids.forEach((id, position) =>
        q.run('INSERT INTO meal_plan (date, meal, recipe_id, position, author_id) VALUES (?, ?, ?, ?, ?)', [
          date,
          meal,
          id,
          position,
          user.id,
        ]),
      );
    });
    return c.json({ date, meal, recipes: entries(date, date, false, meal).map(serializeCard) });
  });
