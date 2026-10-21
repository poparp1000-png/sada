import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createRouter, readJson, sendJson, serveStatic, fail, HttpError } from './http.js';
import {
  USERNAME_RE, normUsername, cleanName, hashPassword, verifyPassword,
  signToken, verifyToken, createLimiter,
} from './auth.js';
import { createRepo } from './repo.js';
import { createMetered } from './metered.js';

const TTL = 20_000;          // مهلة نبضة الحضور
const nowSec = () => Math.floor(Date.now() / 1000);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

export function createApp({ kv, metered: meteredCfg, authSecret, distDir, maxAudio = 100 }) {
  const repo = createRepo(kv);
  const metered = createMetered(meteredCfg);
  const router = createRouter();
  const loginLimiter = createLimiter({ max: 8, windowMs: 10 * 60_000 });
  const registerLimiter = createLimiter({ max: 10, windowMs: 60 * 60_000 });

  // حالة لحظية في الذاكرة (تُبنى من جديد بعد إعادة التشغيل خلال ثوانٍ بفضل نبضات الحضور)
  const rooms = new Map();    // roomName -> meta
  const online = new Map();   // userId -> {status, room, seen}
  const invites = new Map();  // calleeId -> {roomName, fromId, fromName, at}
  const declined = new Map(); // callerId -> {roomName, at}

  const isOnline = (id, now = Date.now()) => {
    const o = online.get(id);
    return !!o && now - o.seen < TTL;
  };

  const publicRoom = (r) => ({
    roomName: r.roomName, title: r.title, kind: r.kind, visibility: r.visibility,
    hostId: r.hostId, hostName: r.hostName, createdAt: r.createdAt,
    callerId: r.callerId, callerName: r.callerName, calleeId: r.calleeId, calleeName: r.calleeName,
  });

  async function authed(req) {
    const h = req.headers.authorization || '';
    const payload = verifyToken(authSecret, h.startsWith('Bearer ') ? h.slice(7) : '');
    const user = payload ? await repo.getUser(payload.uid) : null;
    if (!user) throw fail(401, 'UNAUTHORIZED');
    return user;
  }
  const secure = (fn) => async (ctx) => fn({ ...ctx, user: await authed(ctx.req) });

  async function canJoin(user, room) {
    if (room.kind === 'dm') return [room.callerId, room.calleeId].includes(user.id);
    if (room.hostId === user.id) return true;
    if (room.visibility === 'friends') return (await repo.getLinks(user.id)).friends.includes(room.hostId);
    return true; // everyone، أو invite عبر الرابط (اسم الغرفة عشوائي لا يُخمَّن)
  }

  async function joinPayload(room, user) {
    const isHost = room.hostId === user.id;
    const { token } = await metered.createToken({
      roomName: room.roomName,
      name: user.name,
      isAdmin: isHost,
      externalUserId: user.id,
      ejectAfterElapsedTimeInSec: 6 * 3600,
    });
    return { roomURL: `${metered.roomHost}/${room.roomName}`, token, isHost, room: publicRoom(room) };
  }

  /* ───────── الحساب ───────── */
  router.get('/api/health', async () => ({ configured: metered.configured, storage: kv.kind, persistent: kv.persistent }));

  router.post('/api/auth/register', async ({ body, ip }) => {
    if (!registerLimiter.hit(ip)) throw fail(429, 'TOO_MANY_ATTEMPTS');
    const username = normUsername(body.username);
    const name = cleanName(body.name);
    const password = String(body.password ?? '');
    if (!USERNAME_RE.test(username)) throw fail(400, 'INVALID_USERNAME');
    if (!name) throw fail(400, 'INVALID_NAME');
    if (password.length < 6 || password.length > 100) throw fail(400, 'WEAK_PASSWORD');
    const user = await repo.createUser({ username, name, password });
    return { token: signToken(authSecret, { uid: user.id }), user: repo.publicUser(user) };
  });

  router.post('/api/auth/login', async ({ body, ip }) => {
    const username = normUsername(body.username);
    const key = `${ip}|${username}`;
    if (!loginLimiter.hit(key)) throw fail(429, 'TOO_MANY_ATTEMPTS');
    const user = await repo.findByUsername(username);
    let ok = false;
    if (user) ok = await verifyPassword(String(body.password ?? ''), user.salt, user.hash);
    else await hashPassword('x'); // نفس الزمن تقريباً سواء وُجد المستخدم أم لا
    if (!ok) throw fail(401, 'BAD_CREDENTIALS');
    loginLimiter.reset(key);
    return { token: signToken(authSecret, { uid: user.id }), user: repo.publicUser(user) };
  });

  router.get('/api/me', secure(async ({ user }) => ({ user: repo.publicUser(user) })));

  router.patch('/api/me', secure(async ({ user, body }) => {
    const name = cleanName(body.name);
    if (!name) throw fail(400, 'INVALID_NAME');
    return { user: repo.publicUser(await repo.updateName(user.id, name)) };
  }));

  /* ───────── الأصدقاء ───────── */
  const presenceOf = (id) => {
    if (!isOnline(id)) return 'offline';
    const o = online.get(id);
    if (o.room) return 'room';
    return o.status === 'busy' ? 'busy' : 'available';
  };

  router.get('/api/friends', secure(async ({ user }) => {
    const links = await repo.getLinks(user.id);
    const load = async (ids) => (await Promise.all(ids.map((id) => repo.getUser(id)))).filter(Boolean);
    const [friends, incoming, outgoing] = await Promise.all([load(links.friends), load(links.incoming), load(links.outgoing)]);
    return {
      friends: friends.map((u) => ({ ...repo.publicUser(u), presence: presenceOf(u.id) })),
      incoming: incoming.map(repo.publicUser),
      outgoing: outgoing.map(repo.publicUser),
    };
  }));

  router.post('/api/friends/request', secure(async ({ user, body }) => {
    const username = normUsername(body.username);
    if (!USERNAME_RE.test(username)) throw fail(404, 'USER_NOT_FOUND');
    return repo.requestFriend(user.id, username);
  }));

  router.post('/api/friends/accept', secure(async ({ user, body }) => {
    await repo.acceptFriend(user.id, clean(body.id, 64));
    return { ok: true };
  }));

  router.delete('/api/friends/:id', secure(async ({ user, params }) => {
    await repo.removeLink(user.id, params.id);
    return { ok: true };
  }));

  /* ───────── الحضور والمكالمات ───────── */
  router.post('/api/presence', secure(async ({ user, body }) => {
    const now = Date.now();
    const status = body.status === 'busy' ? 'busy' : 'available';
    const room = body.room ? clean(body.room, 40) : null;
    online.set(user.id, { status, room, seen: now });

    const links = await repo.getLinks(user.id);
    const friendsOnline = [];
    for (const fid of links.friends) {
      if (presenceOf(fid) === 'available') {
        const u = await repo.getUser(fid);
        if (u) friendsOnline.push(repo.publicUser(u));
      }
    }
    const inv = invites.get(user.id);
    const incoming = inv && status === 'available' && !room && now - inv.at < 30_000 ? inv : null;
    const d = declined.get(user.id);
    if (d) declined.delete(user.id);
    return { online: friendsOnline, incoming, pending: links.incoming.length, declined: d?.roomName ?? null };
  }));

  router.post('/api/dm', secure(async ({ user, body }) => {
    const toId = clean(body.toId, 64);
    const links = await repo.getLinks(user.id);
    if (!links.friends.includes(toId)) throw fail(403, 'NOT_FRIENDS');
    const callee = await repo.getUser(toId);
    if (!callee || presenceOf(toId) !== 'available') throw fail(409, 'USER_OFFLINE');

    const roomName = `dm-${randomBytes(4).toString('hex')}`;
    await metered.createRoom({
      roomName, privacy: 'private', maxParticipants: 2, enableChat: false,
      expireUnixSec: nowSec() + 3600, deleteOnExp: true, endMeetingAfterNoActivityInSec: 300,
    });
    const room = {
      roomName, kind: 'dm', title: 'مكالمة', visibility: 'invite', hostId: user.id, hostName: user.name,
      callerId: user.id, callerName: user.name, calleeId: callee.id, calleeName: callee.name, createdAt: Date.now(),
    };
    rooms.set(roomName, room);
    invites.set(callee.id, { roomName, fromId: user.id, fromName: user.name, at: Date.now() });
    return joinPayload(room, user);
  }));

  router.post('/api/dm/decline', secure(async ({ user }) => {
    const inv = invites.get(user.id);
    invites.delete(user.id);
    if (inv) declined.set(inv.fromId, { roomName: inv.roomName, at: Date.now() });
    return { ok: true };
  }));

  /* ───────── الغرف ───────── */
  router.get('/api/rooms', secure(async ({ user }) => {
    const links = await repo.getLinks(user.id);
    const friends = new Set(links.friends);
    const counts = {};
    const now = Date.now();
    for (const [id, o] of online) if (o.room && now - o.seen < TTL) counts[o.room] = (counts[o.room] || 0) + 1;

    const visible = (r) => {
      if (r.kind === 'dm') return false;
      if (r.hostId === user.id) return true;
      if (r.visibility === 'everyone') return true;
      return r.visibility === 'friends' && friends.has(r.hostId);
    };
    const list = [...rooms.values()]
      .filter(visible)
      .filter((r) => counts[r.roomName] > 0 || now - r.createdAt < 120_000)
      .map((r) => ({ ...publicRoom(r), count: counts[r.roomName] || 0 }))
      .sort((a, b) => b.count - a.count);
    return { configured: metered.configured, rooms: list };
  }));

  router.post('/api/rooms', secure(async ({ user, body }) => {
    const kind = body.kind === 'video' ? 'video' : 'audio';
    const visibility = ['everyone', 'friends', 'invite'].includes(body.visibility) ? body.visibility : 'friends';
    const title = clean(body.title, 60);
    if (!title) throw fail(400, 'INVALID_TITLE');

    const roomName = `${kind === 'audio' ? 'a' : 'v'}-${randomBytes(4).toString('hex')}`;
    await metered.createRoom({
      roomName, privacy: 'private', enableChat: true,
      audioOnlyRoom: kind === 'audio', enableScreenSharing: kind === 'video',
      maxParticipants: kind === 'video' ? 8 : Number(maxAudio),
      expireUnixSec: nowSec() + 6 * 3600, deleteOnExp: true,
      endMeetingAfterNoActivityInSec: 900, newChatForMeetingSession: true,
    });
    const room = { roomName, title, kind, visibility, hostId: user.id, hostName: user.name, createdAt: Date.now() };
    rooms.set(roomName, room);
    return joinPayload(room, user);
  }));

  router.post('/api/rooms/:name/join', secure(async ({ user, params }) => {
    const room = rooms.get(params.name);
    if (!room) throw fail(404, 'ROOM_NOT_FOUND');
    if (!(await canJoin(user, room))) throw fail(403, 'FORBIDDEN');
    return joinPayload(room, user);
  }));

  /* ───────── الخادم ───────── */
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname.startsWith('/api/')) {
        const m = router.match(req.method, url.pathname);
        if (!m) throw fail(404, 'NOT_FOUND');
        const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readJson(req) : {};
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        const out = await m.handler({ req, res, params: m.params, body, query: url.searchParams, ip });
        return sendJson(res, 200, out ?? { ok: true });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'METHOD_NOT_ALLOWED');
      if (!distDir || !serveStatic(distDir, url.pathname, res)) { res.writeHead(404); res.end('Not found'); }
      return undefined;
    } catch (e) {
      const known = e instanceof HttpError;
      if (!known) console.error('[error]', e);
      if (res.headersSent) { res.end(); return undefined; }
      return sendJson(res, known ? e.status : 500, { error: known ? e.code : 'SERVER_ERROR' });
    }
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, o] of online) if (now - o.seen > 60_000) online.delete(id);
    for (const [id, i] of invites) if (now - i.at > 30_000) invites.delete(id);
    for (const [id, d] of declined) if (now - d.at > 30_000) declined.delete(id);
    const live = new Set([...online.values()].map((o) => o.room).filter(Boolean));
    for (const [name, r] of rooms) if (!live.has(name) && now - r.createdAt > 600_000) rooms.delete(name);
    loginLimiter.sweep(); registerLimiter.sweep();
  }, 10_000);
  sweep.unref();

  const server = http.createServer(handle);
  return { server, stop: () => clearInterval(sweep) };
}
