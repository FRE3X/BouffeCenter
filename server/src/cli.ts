// Usage: npm run user:create -w server -- <email> <pseudo> <password> [admin|editor]
import { q } from './db.ts';
import { hashPassword } from './lib/auth.ts';

const [email, pseudo, password, role = 'admin'] = process.argv.slice(2);
if (!email || !pseudo || !password || password.length < 8) {
  console.error('Usage: npm run user:create -w server -- <email> <pseudo> <password (8+ chars)> [admin|editor]');
  process.exit(1);
}
q.run(
  `INSERT INTO users (email, pseudo, role, password_hash) VALUES (?, ?, ?, ?)
   ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role`,
  [email, pseudo, role, await hashPassword(password)],
);
console.log(`User ${email} (${role}) ready.`);
