import { randomUUID } from 'node:crypto';
import { fail } from './http.js';
import { hashPassword } from './auth.js';

const emptyLinks = () => ({ friends: [], incoming: [], outgoing: [] });
const without = (arr, id) => arr.filter((x) => x !== id);
const add = (arr, id) => (arr.includes(id) ? arr : [...arr, id]);

/** طبقة الحسابات والأصدقاء فوق مخزن المفاتيح. كل التعديلات تمر عبر قفل واحد لتفادي التضارب. */
export function createRepo(kv) {
  let chain = Promise.resolve();
  const locked = (fn) => {
    const run = chain.then(() => fn());
    chain = run.catch(() => {});
    return run;
  };

  const cache = new Map(); // id -> {user, at}
  const CACHE_MS = 30_000;
  const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name });

  async function getUser(id) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
    const user = await kv.get(`u:${id}`);
    if (user) cache.set(id, { user, at: Date.now() });
    return user;
  }
  const findByUsername = async (username) => {
    const id = await kv.get(`n:${username}`);
    return id ? getUser(id) : null;
  };
  const getLinks = async (id) => ({ ...emptyLinks(), ...((await kv.get(`f:${id}`)) || {}) });

  const createUser = ({ username, name, password }) => locked(async () => {
    if (await kv.get(`n:${username}`)) throw fail(409, 'USERNAME_TAKEN');
    const { salt, hash } = await hashPassword(password);
    const user = { id: randomUUID(), username, name, salt, hash, createdAt: Date.now() };
    await kv.set(`u:${user.id}`, user);
    await kv.set(`n:${username}`, user.id);
    await kv.set(`f:${user.id}`, emptyLinks());
    return user;
  });

  const updateName = (id, name) => locked(async () => {
    const user = await kv.get(`u:${id}`);
    if (!user) throw fail(401, 'UNAUTHORIZED');
    const next = { ...user, name };
    await kv.set(`u:${id}`, next);
    cache.delete(id);
    return next;
  });

  /** طلب صداقة. إن كان الطرف الآخر قد طلبك مسبقاً تتحول الصداقة مباشرة. */
  const requestFriend = (meId, targetUsername) => locked(async () => {
    const target = await findByUsername(targetUsername);
    if (!target) throw fail(404, 'USER_NOT_FOUND');
    if (target.id === meId) throw fail(400, 'CANNOT_ADD_SELF');
    const mine = await getLinks(meId);
    const theirs = await getLinks(target.id);
    if (mine.friends.includes(target.id)) throw fail(409, 'ALREADY_FRIENDS');
    if (mine.outgoing.includes(target.id)) throw fail(409, 'ALREADY_REQUESTED');
    if (mine.incoming.includes(target.id)) {
      await kv.set(`f:${meId}`, { ...mine, friends: add(mine.friends, target.id), incoming: without(mine.incoming, target.id) });
      await kv.set(`f:${target.id}`, { ...theirs, friends: add(theirs.friends, meId), outgoing: without(theirs.outgoing, meId) });
      return { status: 'accepted', user: publicUser(target) };
    }
    await kv.set(`f:${meId}`, { ...mine, outgoing: add(mine.outgoing, target.id) });
    await kv.set(`f:${target.id}`, { ...theirs, incoming: add(theirs.incoming, meId) });
    return { status: 'requested', user: publicUser(target) };
  });

  const acceptFriend = (meId, otherId) => locked(async () => {
    const mine = await getLinks(meId);
    if (!mine.incoming.includes(otherId)) throw fail(404, 'NO_REQUEST');
    const theirs = await getLinks(otherId);
    await kv.set(`f:${meId}`, { ...mine, friends: add(mine.friends, otherId), incoming: without(mine.incoming, otherId) });
    await kv.set(`f:${otherId}`, { ...theirs, friends: add(theirs.friends, meId), outgoing: without(theirs.outgoing, meId) });
  });

  /** يحذف أي علاقة بين الطرفين: صداقة، أو طلب وارد (رفض)، أو طلب صادر (إلغاء). */
  const removeLink = (meId, otherId) => locked(async () => {
    const strip = (l, id) => ({ friends: without(l.friends, id), incoming: without(l.incoming, id), outgoing: without(l.outgoing, id) });
    await kv.set(`f:${meId}`, strip(await getLinks(meId), otherId));
    await kv.set(`f:${otherId}`, strip(await getLinks(otherId), meId));
  });

  return { publicUser, getUser, findByUsername, getLinks, createUser, updateName, requestFriend, acceptFriend, removeLink };
}
