let token = null;
let onUnauthorized = () => {};
export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function j(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw Object.assign(new Error('NETWORK'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !url.startsWith('/api/auth/')) onUnauthorized();
    throw Object.assign(new Error(data.error || 'REQUEST_FAILED'), { status: res.status });
  }
  return data;
}
const send = (method, url, body) => j(url, { method, body: body ? JSON.stringify(body) : undefined });

export const api = {
  health: () => j('/api/health'),
  register: (b) => send('POST', '/api/auth/register', b),
  login: (b) => send('POST', '/api/auth/login', b),
  me: () => j('/api/me'),
  updateMe: (b) => send('PATCH', '/api/me', b),
  friends: () => j('/api/friends'),
  friendRequest: (b) => send('POST', '/api/friends/request', b),
  friendAccept: (b) => send('POST', '/api/friends/accept', b),
  friendRemove: (id) => send('DELETE', `/api/friends/${encodeURIComponent(id)}`),
  rooms: () => j('/api/rooms'),
  createRoom: (b) => send('POST', '/api/rooms', b),
  joinRoom: (name) => send('POST', `/api/rooms/${encodeURIComponent(name)}/join`, {}),
  presence: (b) => send('POST', '/api/presence', b),
  call: (b) => send('POST', '/api/dm', b),
  decline: () => send('POST', '/api/dm/decline', {}),
};

const MESSAGES = {
  NETWORK: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.',
  BAD_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  USERNAME_TAKEN: 'اسم المستخدم محجوز. جرّب اسماً آخر.',
  INVALID_USERNAME: 'اسم المستخدم: حروف إنجليزية صغيرة وأرقام و _ فقط، من ٣ إلى ٢٠ حرفاً.',
  INVALID_NAME: 'اكتب اسمك الظاهر للآخرين.',
  WEAK_PASSWORD: 'كلمة المرور قصيرة. استخدم ٦ أحرف على الأقل.',
  TOO_MANY_ATTEMPTS: 'محاولات كثيرة. انتظر بضع دقائق ثم حاول.',
  UNAUTHORIZED: 'انتهت الجلسة. سجّل الدخول من جديد.',
  USER_NOT_FOUND: 'لا يوجد مستخدم بهذا الاسم.',
  CANNOT_ADD_SELF: 'لا يمكنك إضافة نفسك.',
  ALREADY_FRIENDS: 'أنتما أصدقاء بالفعل.',
  ALREADY_REQUESTED: 'أرسلت طلباً إلى هذا المستخدم من قبل.',
  NO_REQUEST: 'لم يعد هذا الطلب موجوداً.',
  NOT_FRIENDS: 'يمكنك الاتصال بأصدقائك فقط.',
  USER_OFFLINE: 'هذا الصديق غير متاح الآن.',
  ROOM_NOT_FOUND: 'هذه الغرفة لم تعد متاحة.',
  FORBIDDEN: 'هذه الغرفة لأصدقاء المضيف فقط.',
  INVALID_TITLE: 'اكتب عنواناً للغرفة.',
  METERED_NOT_CONFIGURED: 'لم تُضبط مفاتيح Metered في الخادم بعد.',
  METERED_ERROR: 'تعذّر الاتصال بخدمة الصوت والفيديو. حاول بعد قليل.',
};
export const errText = (e) => MESSAGES[e?.message] || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
