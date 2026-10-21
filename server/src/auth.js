import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const normUsername = (v) => String(v ?? '').trim().toLowerCase().replace(/^@/, '');
export const cleanName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scryptAsync(password, salt, 64);
  return { salt, hash: key.toString('hex') };
}

export async function verifyPassword(password, salt, hash) {
  const key = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

/** توكن موقّع (HMAC) بدل جلسات في قاعدة البيانات: لا يحتاج تخزيناً ويصمد أمام إعادة التشغيل. */
export function signToken(secret, payload, ttlSec = 90 * 24 * 3600, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSec })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url'));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp && p.exp > now / 1000 ? p : null;
  } catch { return null; }
}

export const deriveSecret = (seed) => createHash('sha256').update(`sada:auth:${seed}`).digest('hex');

export function createLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
      return arr.length <= max;
    },
    reset(key) { hits.delete(key); },
    sweep(now = Date.now()) {
      for (const [k, v] of hits) {
        const f = v.filter((t) => now - t < windowMs);
        if (f.length) hits.set(k, f); else hits.delete(k);
      }
    },
  };
}
