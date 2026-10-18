async function j(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), { status: res.status });
  return data;
}
const post = (url, body) => j(url, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  rooms: () => j('/api/rooms'),
  createRoom: (b) => post('/api/rooms', b),
  joinRoom: (name, b) => post(`/api/rooms/${encodeURIComponent(name)}/join`, b),
  presence: (b) => post('/api/presence', b),
  call: (b) => post('/api/dm', b),
  decline: (b) => post('/api/dm/decline', b),
};

const MESSAGES = {
  METERED_NOT_CONFIGURED: 'لم تُضبط مفاتيح Metered بعد. أضفها في server/.env ثم أعد تشغيل الخادم.',
  METERED_ERROR: 'تعذّر الاتصال بخدمة Metered. تحقق من اسم التطبيق والمفتاح السري.',
  ROOM_NOT_FOUND: 'هذه الغرفة لم تعد متاحة.',
  USER_OFFLINE: 'هذا الصديق غير متاح الآن.',
  FORBIDDEN: 'لا يمكنك دخول هذه الغرفة.',
};
export const errText = (e) => MESSAGES[e?.message] || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
