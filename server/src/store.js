import fs from 'node:fs';
import path from 'node:path';

/** تخزين مفتاح/قيمة في ملف JSON (للتطوير، أو عند عدم ضبط Postgres). */
export function createFileKV(file) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  let timer = null;
  const flush = () => {
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    } catch (e) { console.error('[store] تعذّرت الكتابة:', e.message); }
  };
  const schedule = () => { if (!timer) { timer = setTimeout(flush, 300); timer.unref?.(); } };
  return {
    kind: 'file',
    persistent: false,
    async get(k) { return k in data ? structuredClone(data[k]) : null; },
    async set(k, v) { data[k] = structuredClone(v); schedule(); },
    async del(k) { delete data[k]; schedule(); },
    async close() { if (timer) { clearTimeout(timer); flush(); } },
  };
}

/** تخزين دائم في Postgres: جدول واحد kv(k, v jsonb). */
export async function createPgKV(url) {
  const { default: pg } = await import('pg');
  const host = new URL(url).hostname;
  const local = host.endsWith('.railway.internal') || host === 'localhost' || host === '127.0.0.1';
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  await pool.query('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
  return {
    kind: 'postgres',
    persistent: true,
    async get(k) { const r = await pool.query('SELECT v FROM kv WHERE k = $1', [k]); return r.rows[0]?.v ?? null; },
    async set(k, v) {
      await pool.query('INSERT INTO kv (k, v) VALUES ($1, $2::jsonb) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v', [k, JSON.stringify(v)]);
    },
    async del(k) { await pool.query('DELETE FROM kv WHERE k = $1', [k]); },
    async close() { await pool.end(); },
  };
}
