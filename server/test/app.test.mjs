import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createFileKV } from '../src/store.js';
import { deriveSecret } from '../src/auth.js';

let mock, mockUrl, app, base, stopApp;
const calls = [];

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));

before(async () => {
  // نسخة وهمية من Metered REST
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      if (u.searchParams.get('secretKey') !== 'S3CR3T') { res.writeHead(401); return res.end('{}'); }
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: u.pathname, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (u.pathname.endsWith('/token')) return res.end(JSON.stringify({ token: `tok-${body.externalUserId}-${body.isAdmin}` }));
      return res.end(JSON.stringify({ ok: true }));
    });
  });
  mockUrl = await listen(mock);

  const file = path.join(os.tmpdir(), `sada-test-${Date.now()}.json`);
  const made = createApp({
    kv: createFileKV(file),
    authSecret: deriveSecret('test'),
    metered: { app: 'x', secret: 'S3CR3T', base: `${mockUrl}/api/v1` },
  });
  app = made.server; stopApp = made.stop;
  base = await listen(app);
});

after(() => { stopApp(); app.close(); mock.close(); });

async function req(method, url, { body, token } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const register = (username, name = username, password = 'secret1') => req('POST', '/api/auth/register', { body: { username, name, password } });

const people = {};
test('الصحة', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.configured, true);
  assert.equal(r.data.storage, 'file');
});

test('التسجيل والتحقق من المدخلات', async () => {
  for (const [u, n] of [['alice', 'أليس'], ['bob', 'بوب'], ['carol', 'كارول']]) {
    const r = await register(u, n);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    people[u] = r.data;
  }
  assert.equal((await register('alice')).status, 409);
  assert.equal((await register('ALICE')).data.error, 'USERNAME_TAKEN');
  assert.equal((await register('ab')).data.error, 'INVALID_USERNAME');
  assert.equal((await register('bad name!')).data.error, 'INVALID_USERNAME');
  assert.equal((await register('dave', 'دايف', '123')).data.error, 'WEAK_PASSWORD');
  assert.equal((await req('POST', '/api/auth/register', { body: { username: 'erin', name: '  ', password: 'secret1' } })).data.error, 'INVALID_NAME');
});

test('الدخول والتوكن', async () => {
  const ok = await req('POST', '/api/auth/login', { body: { username: 'Alice', password: 'secret1' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'alice', password: 'wrong' } })).status, 401);
  assert.equal((await req('POST', '/api/auth/login', { body: { username: 'nobody', password: 'secret1' } })).data.error, 'BAD_CREDENTIALS');
  assert.equal((await req('GET', '/api/me')).status, 401);
  assert.equal((await req('GET', '/api/me', { token: 'x.y' })).status, 401);
  const me = await req('GET', '/api/me', { token: people.alice.token });
  assert.equal(me.data.user.username, 'alice');
  assert.equal(me.data.user.hash, undefined, 'لا يجب كشف الهاش');
  const up = await req('PATCH', '/api/me', { token: people.alice.token, body: { name: 'أليس الجديدة' } });
  assert.equal(up.data.user.name, 'أليس الجديدة');
});

test('تحديد معدل محاولات الدخول', async () => {
  let last;
  for (let i = 0; i < 10; i += 1) last = await req('POST', '/api/auth/login', { body: { username: 'carol', password: 'nope' } });
  assert.equal(last.status, 429);
});

test('الأصدقاء: طلب، قبول، رفض، حذف', async () => {
  const A = people.alice.token; const B = people.bob.token; const C = people.carol.token;
  assert.equal((await req('POST', '/api/friends/request', { token: A, body: { username: 'ghost' } })).data.error, 'USER_NOT_FOUND');
  assert.equal((await req('POST', '/api/friends/request', { token: A, body: { username: 'alice' } })).data.error, 'CANNOT_ADD_SELF');
  const r1 = await req('POST', '/api/friends/request', { token: A, body: { username: '@Bob' } });
  assert.equal(r1.data.status, 'requested');
  assert.equal((await req('POST', '/api/friends/request', { token: A, body: { username: 'bob' } })).data.error, 'ALREADY_REQUESTED');
  const bf = await req('GET', '/api/friends', { token: B });
  assert.equal(bf.data.incoming.length, 1);
  assert.equal(bf.data.incoming[0].username, 'alice');
  assert.equal((await req('POST', '/api/presence', { token: B, body: {} })).data.pending, 1);
  await req('POST', '/api/friends/accept', { token: B, body: { id: people.alice.user.id } });
  assert.equal((await req('GET', '/api/friends', { token: A })).data.friends[0].username, 'bob');
  assert.equal((await req('POST', '/api/friends/accept', { token: B, body: { id: people.alice.user.id } })).data.error, 'NO_REQUEST');
  // طلب متبادل يتحول إلى صداقة مباشرة
  await req('POST', '/api/friends/request', { token: C, body: { username: 'alice' } });
  const mutual = await req('POST', '/api/friends/request', { token: A, body: { username: 'carol' } });
  assert.equal(mutual.data.status, 'accepted');
  // رفض/حذف
  await req('DELETE', `/api/friends/${people.carol.user.id}`, { token: A });
  assert.equal((await req('GET', '/api/friends', { token: C })).data.friends.length, 0);
});

test('الغرف: الظهور والدخول حسب الخصوصية', async () => {
  const A = people.alice.token; const B = people.bob.token; const C = people.carol.token;
  const mk = (token, visibility, title = 'غرفة') => req('POST', '/api/rooms', { token, body: { title, kind: 'audio', visibility } });
  const friendsRoom = await mk(A, 'friends', 'للأصدقاء');
  const publicRoom = await mk(A, 'everyone', 'للجميع');
  const inviteRoom = await mk(A, 'invite', 'بدعوة');
  assert.equal(friendsRoom.status, 200);
  assert.equal(friendsRoom.data.isHost, true);
  assert.match(friendsRoom.data.token, /true$/);
  assert.equal((await mk(A, 'friends', '  ')).data.error, 'INVALID_TITLE');

  const titles = async (t) => (await req('GET', '/api/rooms', { token: t })).data.rooms.map((r) => r.title).sort();
  assert.deepEqual(await titles(A), ['بدعوة', 'للأصدقاء', 'للجميع'].sort());
  assert.deepEqual(await titles(B), ['للأصدقاء', 'للجميع'].sort());   // صديق
  assert.deepEqual(await titles(C), ['للجميع']);                       // ليس صديقاً
  // الدخول
  assert.equal((await req('POST', `/api/rooms/${friendsRoom.data.room.roomName}/join`, { token: C })).status, 403);
  const joinB = await req('POST', `/api/rooms/${friendsRoom.data.room.roomName}/join`, { token: B });
  assert.equal(joinB.status, 200);
  assert.match(joinB.data.token, /false$/);                           // ليس مضيفاً
  assert.equal((await req('POST', `/api/rooms/${inviteRoom.data.room.roomName}/join`, { token: C })).status, 200); // عبر الرابط
  assert.equal((await req('POST', '/api/rooms/zzz/join', { token: B })).status, 404);
  assert.equal((await req('GET', '/api/rooms')).status, 401);
  // الاسم يأتي من الحساب لا من العميل
  const spoof = calls.filter((c) => c.path.endsWith('/token')).at(-1);
  assert.ok(spoof.body.externalUserId);
});

test('الحضور والعدّاد', async () => {
  const B = people.bob.token;
  const list = (await req('GET', '/api/rooms', { token: B })).data.rooms.find((r) => r.title === 'للجميع');
  await req('POST', '/api/presence', { token: B, body: { room: list.roomName } });
  const after = (await req('GET', '/api/rooms', { token: B })).data.rooms.find((r) => r.title === 'للجميع');
  assert.equal(after.count, 1);
});

test('المكالمات: للأصدقاء فقط، رفض، ردّ', async () => {
  const A = people.alice.token; const B = people.bob.token; const C = people.carol.token;
  await req('POST', '/api/presence', { token: A, body: {} });
  await req('POST', '/api/presence', { token: B, body: {} });
  await req('POST', '/api/presence', { token: C, body: {} });
  assert.equal((await req('POST', '/api/dm', { token: A, body: { toId: people.carol.user.id } })).data.error, 'NOT_FRIENDS');

  const p = await req('POST', '/api/presence', { token: A, body: {} });
  assert.deepEqual(p.data.online.map((u) => u.username), ['bob']);

  const call = await req('POST', '/api/dm', { token: A, body: { toId: people.bob.user.id } });
  assert.equal(call.status, 200, JSON.stringify(call.data));
  const bp = await req('POST', '/api/presence', { token: B, body: {} });
  assert.equal(bp.data.incoming.fromName, 'أليس الجديدة');
  // غير المدعو لا يدخل مكالمة خاصة
  assert.equal((await req('POST', `/api/rooms/${call.data.room.roomName}/join`, { token: C })).status, 403);
  assert.equal((await req('POST', `/api/rooms/${call.data.room.roomName}/join`, { token: B })).status, 200);

  // رفض
  await req('POST', '/api/presence', { token: B, body: {} });
  const call2 = await req('POST', '/api/dm', { token: A, body: { toId: people.bob.user.id } });
  await req('POST', '/api/dm/decline', { token: B });
  const ap = await req('POST', '/api/presence', { token: A, body: {} });
  assert.equal(ap.data.declined, call2.data.room.roomName);
  assert.equal((await req('POST', '/api/presence', { token: A, body: {} })).data.declined, null, 'تُستهلك مرة واحدة');
  // مشغول
  await req('POST', '/api/presence', { token: B, body: { status: 'busy' } });
  assert.equal((await req('POST', '/api/dm', { token: A, body: { toId: people.bob.user.id } })).data.error, 'USER_OFFLINE');
});

test('مسارات غير موجودة وطلبات سيئة', async () => {
  assert.equal((await req('GET', '/api/nope')).status, 404);
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: '{bad json', headers: { 'Content-Type': 'application/json' } });
  assert.equal(res.status, 400);
  const html = await fetch(`${base}/anything`);
  assert.equal(html.status, 404); // لا واجهة مبنية في الاختبار
});
