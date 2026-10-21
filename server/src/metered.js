import { fail } from './http.js';

export function createMetered({ app, secret, base }) {
  const configured = Boolean(secret && (base || app));
  const api = base || `https://${app}.metered.live/api/v1`;
  const roomHost = base ? new URL(base).host : `${app}.metered.live`;

  async function call(method, route, body) {
    if (!configured) throw fail(503, 'METERED_NOT_CONFIGURED');
    let res;
    try {
      res = await fetch(`${api}${route}?secretKey=${encodeURIComponent(secret)}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      console.error('[metered] تعذّر الاتصال:', e.message);
      throw fail(502, 'METERED_ERROR');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[metered]', method, route, res.status, data); // المفتاح لا يُطبع أبداً
      throw fail(502, 'METERED_ERROR');
    }
    return data;
  }

  return {
    configured,
    roomHost,
    createRoom: (body) => call('POST', '/room', body),
    createToken: (body) => call('POST', '/token', body),
  };
}
