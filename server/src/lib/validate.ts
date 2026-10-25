import type { ValidationTargets } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

/** zValidator with a flat `{ error }` body, consistent with the rest of the API. */
export const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(target: Target, schema: Schema) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues.map((i) => (i.path.length ? `${i.path.join('.')} : ${i.message}` : i.message)).join(', ');
      return c.json({ error: message }, 400);
    }
  });
