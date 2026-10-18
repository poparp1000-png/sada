import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errText } from './lib/api.js';
import Splash from './screens/Splash.jsx';
import Home from './screens/Home.jsx';
import NewRoom from './screens/NewRoom.jsx';
import AudioRoom from './screens/AudioRoom.jsx';
import VideoRoom from './screens/VideoRoom.jsx';
import DirectCall from './screens/DirectCall.jsx';
import Toast from './components/Toast.jsx';

const load = () => { try { return JSON.parse(localStorage.getItem('sada.profile')); } catch { return null; } };

export default function App() {
  const [profile, setProfile] = useState(load);
  const [status, setStatus] = useState('available');
  const [view, setView] = useState({ name: 'home' });
  const [tab, setTab] = useState('home');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [net, setNet] = useState({ online: [], incoming: null });
  const roomRef = useRef(null);
  const live = useRef({});
  live.current = { view, sheet, tab };

  const toast = useCallback((m) => setMsg(m), []);
  const clearToast = useCallback(() => setMsg(null), []);

  const saveProfile = (name) => {
    const p = { id: profile?.id || crypto.randomUUID(), name };
    localStorage.setItem('sada.profile', JSON.stringify(p));
    setProfile(p);
  };

  useEffect(() => { roomRef.current = view.join?.room?.roomName ?? null; }, [view]);
  useEffect(() => {
    if (!profile) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const d = await api.presence({ id: profile.id, name: profile.name, status, room: roomRef.current });
        if (!stop) setNet(d);
      } catch { /* الخادم غير متاح مؤقتاً */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [profile, status]);

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
      const j = await api.joinRoom(roomName, { id: profile.id, name: profile.name });
      setView({ name: j.room.kind, join: j });
    } catch (e) { toast(errText(e)); }
  }, [profile, toast]);

  useEffect(() => {
    const mm = location.pathname.match(/^\/r\/([\w-]+)$/);
    if (profile && mm) { history.replaceState(null, '', '/'); enter(mm[1]); }
  }, [profile]); // eslint-disable-line

  const create = async ({ kind, title, visibility }) => {
    setBusy(true);
    try {
      const j = await api.createRoom({ kind, title, visibility, hostId: profile.id, hostName: profile.name });
      setSheet(false);
      setView({ name: j.room.kind, join: j });
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };

  const call = async (friend) => {
    try {
      const j = await api.call({ fromId: profile.id, fromName: profile.name, toId: friend.id });
      setView({ name: 'dm', join: j });
    } catch (e) { toast(errText(e)); }
  };
  const accept = (inv) => { setNet((n) => ({ ...n, incoming: null })); enter(inv.roomName); };
  const decline = async () => { setNet((n) => ({ ...n, incoming: null })); try { await api.decline({ id: profile.id }); } catch { /* ignore */ } };
  const leave = () => setView({ name: 'home' });

  if (!profile) return <div className="app"><Splash onDone={saveProfile} /><Toast message={msg} onDone={clearToast} /></div>;

  const common = { join: view.join, me: profile, onLeave: leave, toast };
  return (
    <div className="app">
      {view.name === 'audio' && <AudioRoom key={view.join.room.roomName} {...common} />}
      {view.name === 'video' && <VideoRoom key={view.join.room.roomName} {...common} />}
      {view.name === 'dm' && <DirectCall key={view.join.room.roomName} {...common} />}
      {view.name === 'home' && (
        <Home profile={profile} status={status} setStatus={setStatus} tab={tab} setTab={setTab} net={net}
          onEnter={enter} onNew={() => setSheet(true)} onCall={call} onAccept={accept} onDecline={decline}
          onRename={saveProfile} toast={toast} />
      )}
      {sheet && view.name === 'home' && <NewRoom onClose={() => setSheet(false)} onCreate={create} busy={busy} />}
      <Toast message={msg} onDone={clearToast} />
    </div>
  );
}
