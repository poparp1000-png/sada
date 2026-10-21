import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const fail = (status, code) => new HttpError(status, code);

/** موجّه صغير بدل express: لا اعتماديات ولا نقاط ضعف من مكتبات خارجية. */
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    routes.push({ method, rx: new RegExp(`^${source}/?$`), keys, handler });
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    patch: (p, h) => add('PATCH', p, h),
    delete: (p, h) => add('DELETE', p, h),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.rx.exec(pathname);
        if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      }
      return null;
    },
  };
}

export async function readJson(req, limit = 20_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw fail(413, 'TOO_LARGE');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch { throw fail(400, 'BAD_JSON'); }
}

export function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

/** يخدم ملفات الواجهة المبنية. يرجع true إن تعامل مع الطلب. */
export function serveStatic(dist, pathname, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const file = path.join(dist, path.normalize(decoded));
  if (file !== dist && !file.startsWith(dist + path.sep)) return false; // منع الخروج من المجلد
  let target = file;
  let st = null;
  try {
    st = statSync(target);
    if (st.isDirectory()) { target = path.join(target, 'index.html'); st = statSync(target); }
  } catch { st = null; }
  if (!st) {
    if (path.extname(decoded)) return false; // ملف مفقود بامتداد: 404 حقيقي
    target = path.join(dist, 'index.html'); // مسارات الواجهة (مثل /r/abc)
    try { st = statSync(target); } catch { return false; }
  }
  const isAsset = target.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
  return true;
}
