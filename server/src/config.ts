import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(import.meta.dirname, '../../data'));

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:4321').replace(/\/$/, ''),
  dataDir,
  dbPath: path.join(dataDir, 'bouffe-center.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
  maxRestoreBytes: Number(process.env.MAX_RESTORE_MB ?? 4096) * 1024 * 1024,
  sessionDays: 30,
  inviteDays: 7,
  secureCookies: (process.env.PUBLIC_URL ?? '').startsWith('https:'),
  // Astro SSR build, mounted in the same process in production
  webDist: path.resolve(process.env.WEB_DIST ?? path.join(import.meta.dirname, '../../web/dist')),
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    pseudo: process.env.ADMIN_PSEUDO ?? 'admin',
  },
};
