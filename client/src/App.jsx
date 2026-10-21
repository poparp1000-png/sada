import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errText, setToken, setUnauthorizedHandler } from './lib/api.js';
import { clearAuth, loadAuth, saveAuth } from './lib/session.js';
import Splash from './screens/Splash.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import NewRoom from './screens/NewRoom.jsx';
import AudioRoom from './screens/AudioRoom.jsx';
import VideoRoom from './screens/VideoRoom.jsx';
import DirectCall from './screens/DirectCall.jsx';
import Toast from './components/Toast.jsx';

const INVITE_RE = /^\/r\/([\w-]+)$/;

export default function App() {
  const [auth, setAuth] = useState(loadAuth);
  const [authMode, setAuthMode] = useState(null); // null: شاشة الترحيب، وإلا login/register
  const [status, setStatus] = useState('available');
  const [view, setView] = useState({ name: 'home' });
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [net, setNet] = useState({ online: [], incoming: null, pending: 0, declined: null });
  const roomRef = useRef(null);
  const live = useRef({});
  live.current = { view, sheet, tab };

  // يجب أن يُضبط قبل رسم الأبناء، لأن طلباتهم الأولى تحتاج التوكن
  setToken(auth?.token ?? null);
  const me = auth?.user;

  const toast = useCallback((m) => setMsg(m), []);
  const clearToast = useCallback(() => setMsg(null), []);

  const logout = useCallback((note) => {
    clearAuth();
    setAuth(null);
    setAuthMode('login');
    setView({ name: 'home' });
    setTab('home');
    setSheet(false);
    setNet({ online: [], incoming: null, pending: 0, declined: null });
    if (note) setMsg(note);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout('انتهت الجلسة. سجّل الدخول من جديد.'));
  }, [logout]);

  const onAuthDone = (out) => {
    saveAuth(out);
    setAuth(out);
    setAuthMode(null);
  };

  const rename = async (name) => {
    try {
      const out = await api.updateMe({ name });
      const next = { ...auth, user: out.user };
      saveAuth(next);
      setAuth(next);
      toast('تم حفظ الاسم.');
    } catch (e) { toast(errText(e)); }
  };

  // نبضة حضور كل ٤ ثوانٍ: الحالة والغرفة الحالية، وتجلب الأصدقاء المتاحين والمكالمات وعدد الطلبات
  useEffect(() => { roomRef.current = view.join?.room?.roomName ?? null; }, [view]);
  const pulse = useRef(() => {});
  useEffect(() => {
    if (!auth) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const d = await api.presence({ status, room: roomRef.current });
        if (!stop) setNet(d);
      } catch { /* الخادم غير متاح مؤقتاً */ }
    };
    pulse.current = tick;
    tick();
    const t = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [auth, status]);

  // زر الرجوع في تطبيق أندرويد (WebView) يستدعي هذه الدالة: ترجع true إذا تعاملت مع الضغطة
  useEffect(() => {
    window.__sadaBack = () => {
      const s = live.current;
      if (s.view.name !== 'home') { setView({ name: 'home' }); return true; }
      if (s.sheet) { setSheet(false); return true; }
      if (s.tab !== 'home') { setTab('home'); return true; }
      return false;
    };
    return () => { delete window.__sadaBack; };
  }, []);

  const enter = useCallback(async (roomName) => {
    try {
      const j = await api.joinRoom(roomName);
      setView({ name: j.room.kind, join: j });
    } catch (e) { toast(errText(e)); }
  }, [toast]);

  // رابط دعوة /r/<اسم الغرفة>: إن لم تكن مسجلاً نحفظه ونكمل بعد الدخول
  useEffect(() => {
    const m = window.location.pathname.match(INVITE_RE);
    if (m) window.history.replaceState(null, '', '/');
    if (!auth) { if (m) sessionStorage.setItem('sada.pending', m[1]); return; }
    const pending = m?.[1] || sessionStorage.getItem('sada.pending');
    if (pending) { sessionStorage.removeItem('sada.pending'); enter(pending); }
  }, [auth, enter]);

  // رفض الطرف الآخر مكالمتك
  useEffect(() => {
    if (net.declined && view.name === 'dm' && view.join.room.roomName === net.declined) {
      toast('رفض المكالمة.');
      setView({ name: 'home' });
    }
  }, [net.declined]); // eslint-disable-line

  const create = async ({ kind, title, visibility }) => {
    setBusy(true);
    try {
      const j = await api.createRoom({ kind, title, visibility });
      setSheet(false);
      setView({ name: j.room.kind, join: j });
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };

  const call = async (friend) => {
    try {
      const j = await api.call({ toId: friend.id });
      setView({ name: 'dm', join: j });
    } catch (e) { toast(errText(e)); }
  };
  const accept = (inv) => { setNet((n) => ({ ...n, incoming: null })); enter(inv.roomName); };
  const decline = async () => {
    setNet((n) => ({ ...n, incoming: null }));
    try { await api.decline(); } catch { /* ignore */ }
  };
  const leave = () => setView({ name: 'home' });

  if (!auth) {
    return (
      <div className="app">
        {authMode === null
          ? <Splash onStart={setAuthMode} />
          : <Auth key={authMode} initialMode={authMode} onDone={onAuthDone} onBack={() => setAuthMode(null)} />}
        <Toast message={msg} onDone={clearToast} />
      </div>
    );
  }

  const common = { join: view.join, me, onLeave: leave, toast };
  return (
    <div className="app">
      {view.name === 'audio' && <AudioRoom key={view.join.room.roomName} {...common} />}
      {view.name === 'video' && <VideoRoom key={view.join.room.roomName} {...common} />}
      {view.name === 'dm' && <DirectCall key={view.join.room.roomName} {...common} />}
      {view.name === 'home' && (
        <Home profile={me} status={status} setStatus={setStatus} tab={tab} setTab={setTab} net={net}
          onEnter={enter} onNew={() => setSheet(true)} onCall={call} onAccept={accept} onDecline={decline}
          onRename={rename} onLogout={() => logout()} onRequestsChanged={() => pulse.current()} toast={toast} />
      )}
      {sheet && view.name === 'home' && <NewRoom onClose={() => setSheet(false)} onCreate={create} busy={busy} />}
      <Toast message={msg} onDone={clearToast} />
    </div>
  );
}
