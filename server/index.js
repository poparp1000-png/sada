import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';
import { createFileKV, createPgKV } from './src/store.js';
import { deriveSecret } from './src/auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile?.(path.join(here, '.env')); } catch { /* لا يوجد ملف .env: طبيعي في الإنتاج */ }
const env = process.env;

let kv;
if (env.DATABASE_URL) {
  try {
    kv = await createPgKV(env.DATABASE_URL);
  } catch (e) {
    console.error('⚠️  فشل الاتصال بقاعدة البيانات، سيُستخدم ملف مؤقت (الحسابات ستضيع عند النشر):', e.message);
  }
}
if (!kv) {
  kv = createFileKV(env.DATA_FILE || path.join(here, 'data', 'store.json'));
  console.warn('⚠️  التخزين مؤقت. أضف DATABASE_URL (Postgres) ليبقى المستخدمون والأصدقاء بعد كل نشر.');
}

const authSecret = env.AUTH_SECRET || deriveSecret(env.METERED_SECRET_KEY || 'dev-only-secret');
if (!env.AUTH_SECRET && !env.METERED_SECRET_KEY) console.warn('⚠️  لا AUTH_SECRET ولا METERED_SECRET_KEY: مفتاح التوقيع افتراضي وغير آمن.');
if (!env.METERED_APP_NAME || !env.METERED_SECRET_KEY) console.warn('⚠️  METERED_APP_NAME / METERED_SECRET_KEY غير مضبوطين: الغرف لن تعمل.');

const dist = path.resolve(here, '../client/dist');
const { server, stop } = createApp({
  kv,
  authSecret,
  distDir: existsSync(dist) ? dist : null,
  maxAudio: Number(env.MAX_AUDIO_PARTICIPANTS || 100),
  metered: { app: env.METERED_APP_NAME, secret: env.METERED_SECRET_KEY },
});

const port = Number(env.PORT || 8787);
server.listen(port, '0.0.0.0', () => console.log(`صدى يعمل على المنفذ ${port} (التخزين: ${kv.kind})`));

const shutdown = async () => {
  stop();
  server.close();
  try { await kv.close?.(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
