import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const {
  METERED_APP_NAME,
  METERED_SECRET_KEY,
  PORT = 8787,
  MAX_AUDIO_PARTICIPANTS = 100,
} = process.env;

const configured = Boolean(METERED_APP_NAME && METERED_SECRET_KEY);
const API = `https://${METERED_APP_NAME}.metered.live/api/v1`;
const ROOM_HOST = `${METERED_APP_NAME}.metered.live`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fail = (status, code) => Object.assign(new Error(code), { status });
const nowSec = () => Math.floor(Date.now() / 1000);
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/* ───────────── Metered REST ───────────── */
async function metered(method, route, body) {
  if (!configured) throw fail(503, 'METERED_NOT_CONFIGURED');
  const url = `${API}${route}?secretKey=${encodeURIComponent(METERED_SECRET_KEY)}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[metered]', method, route, res.status, data); // المفتاح لا يُطبع أبداً
    throw fail(502, 'METERED_ERROR');
  }
  return data;
}

/* ───────────── حالة في الذاكرة ─────────────
   للإنتاج مع أكثر من نسخة من الخادم: انقلها إلى Redis أو قاعدة بيانات. */
const rooms = new Map();   // roomName -> meta
const users = new Map();   // userId   -> {id,name,status,room,seen}
const invites = new Map(); // userId   -> {roomName,fromName,fromId,at}

const publicRoom = (r) => ({
  roomName: r.roomName, title: r.title, kind: r.kind, visibility: r.visibility,
  hostId: r.hostId, hostName: r.hostName, createdAt: r.createdAt,
  callerId: r.callerId, callerName: r.callerName, calleeId: r.calleeId, calleeName: r.calleeName,
});

function listRooms() {
  const counts = {};
  for (const u of users.values()) if (u.room) counts[u.room] = (counts[u.room] || 0) + 1;
  const now = Date.now();
  return [...rooms.values()]
    .filter((r) => r.kind !== 'dm' && r.visibility !== 'invite')
    .filter((r) => counts[r.roomName] > 0 || now - r.createdAt < 120_000)
    .map((r) => ({ ...publicRoom(r), count: counts[r.roomName] || 0 }))
    .sort((a, b) => b.count - a.count);
}

async function joinPayload(room, id, name) {
  const isHost = room.hostId === id;
  const { token } = await metered('POST', '/token', {
    roomName: room.roomName,
    name,
    isAdmin: isHost,
    externalUserId: id,
    ejectAfterElapsedTimeInSec: 6 * 3600,
  });
  return { roomURL: `${ROOM_HOST}/${room.roomName}`, token, isHost, room: publicRoom(room) };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, u] of users) if (now - u.seen > 20_000) users.delete(id);
  for (const [id, i] of invites) if (now - i.at > 30_000) invites.delete(id);
  const live = new Set([...users.values()].map((u) => u.room).filter(Boolean));
  for (const [name, r] of rooms) if (!live.has(name) && now - r.createdAt > 600_000) rooms.delete(name);
}, 10_000).unref();

/* ───────────── API ───────────── */
const app = express();
app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => res.json({ configured }));

app.get('/api/rooms', (_req, res) => res.json({ configured, rooms: listRooms() }));

app.post('/api/rooms', async (req, res) => {
  const kind = req.body?.kind === 'video' ? 'video' : 'audio';
  const visibility = ['everyone', 'friends', 'invite'].includes(req.body?.visibility) ? req.body.visibility : 'friends';
  const title = clean(req.body?.title, 60);
  const hostId = clean(req.body?.hostId, 64);
  const hostName = clean(req.body?.hostName, 40);
  if (!title || !hostId || !hostName) throw fail(400, 'BAD_REQUEST');

  const roomName = `${kind === 'audio' ? 'a' : 'v'}-${randomBytes(4).toString('hex')}`;
  await metered('POST', '/room', {
    roomName,
    privacy: 'private',            // الدخول بتوكن يصدره هذا الخادم فقط
    enableChat: true,              // نستخدم الدردشة كقناة تحكم (رفع اليد، المنصة، التفاعلات)
    audioOnlyRoom: kind === 'audio',
    enableScreenSharing: kind === 'video',
    maxParticipants: kind === 'video' ? 8 : Number(MAX_AUDIO_PARTICIPANTS),
    expireUnixSec: nowSec() + 6 * 3600,
    deleteOnExp: true,
    endMeetingAfterNoActivityInSec: 900,
    newChatForMeetingSession: true,
  });

  const room = { roomName, title, kind, visibility, hostId, hostName, createdAt: Date.now() };
  rooms.set(roomName, room);
  res.json(await joinPayload(room, hostId, hostName));
});

app.post('/api/rooms/:name/join', async (req, res) => {
  const room = rooms.get(req.params.name);
  if (!room) throw fail(404, 'ROOM_NOT_FOUND');
  const id = clean(req.body?.id, 64);
  const name = clean(req.body?.name, 40);
  if (!id || !name) throw fail(400, 'BAD_REQUEST');
  if (room.kind === 'dm' && ![room.callerId, room.calleeId].includes(id)) throw fail(403, 'FORBIDDEN');
  res.json(await joinPayload(room, id, name));
});

app.post('/api/presence', (req, res) => {
  const id = clean(req.body?.id, 64);
  const name = clean(req.body?.name, 40);
  if (!id || !name) throw fail(400, 'BAD_REQUEST');
  const status = req.body?.status === 'busy' ? 'busy' : 'available';
  const room = req.body?.room ? clean(req.body.room, 40) : null;
  users.set(id, { id, name, status, room, seen: Date.now() });

  const online = [...users.values()]
    .filter((u) => u.id !== id && u.status === 'available' && !u.room)
    .map(({ id, name }) => ({ id, name }));
  const incoming = status === 'available' && !room ? invites.get(id) ?? null : null;
  res.json({ online, incoming });
});

app.post('/api/dm', async (req, res) => {
  const fromId = clean(req.body?.fromId, 64);
  const fromName = clean(req.body?.fromName, 40);
  const callee = users.get(clean(req.body?.toId, 64));
  if (!fromId || !fromName) throw fail(400, 'BAD_REQUEST');
  if (!callee || callee.status !== 'available' || callee.room) throw fail(409, 'USER_OFFLINE');

  const roomName = `dm-${randomBytes(4).toString('hex')}`;
  await metered('POST', '/room', {
    roomName,
    privacy: 'private',
    maxParticipants: 2,
    enableChat: false,
    expireUnixSec: nowSec() + 3600,
    deleteOnExp: true,
    endMeetingAfterNoActivityInSec: 300,
  });
  const room = {
    roomName, kind: 'dm', title: 'مكالمة', visibility: 'invite',
    hostId: fromId, hostName: fromName,
    callerId: fromId, callerName: fromName, calleeId: callee.id, calleeName: callee.name,
    createdAt: Date.now(),
  };
  rooms.set(roomName, room);
  invites.set(callee.id, { roomName, fromName, fromId, at: Date.now() });
  res.json(await joinPayload(room, fromId, fromName));
});

app.post('/api/dm/decline', (req, res) => {
  invites.delete(clean(req.body?.id, 64));
  res.json({ ok: true });
});

/* ───────────── الواجهة المبنية (للإنتاج) ───────────── */
const dist = path.resolve(__dirname, '../client/dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next());
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'SERVER_ERROR' });
});

app.listen(PORT, () => {
  console.log(`صدى يعمل على http://localhost:${PORT}`);
  if (!configured) console.warn('⚠️  METERED_APP_NAME / METERED_SECRET_KEY غير مضبوطين. انسخ server/.env.example إلى server/.env');
});
