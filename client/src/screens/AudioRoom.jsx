import { useEffect, useState } from 'react';
import { useMeeting } from '../lib/useMeeting.js';
import { ar, nListeners, since } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const REACTS = ['❤️', '👏', '😂', '🔥'];

export default function AudioRoom({ join, me, onLeave, toast }) {
  const { roomURL, token, isHost, room } = join;
  const m = useMeeting({ roomURL, token, name: me.name, isHost });
  const [reactOpen, setReactOpen] = useState(false);
  const [handsOpen, setHandsOpen] = useState(false);
  const [cc, setCc] = useState(false);

  const canSpeak = isHost || m.stage.includes(m.selfId);
  const all = Object.values(m.people);
  const host = all.find((p) => p.isAdmin);
  const speakers = m.stage.map((id) => m.people[id]).filter((p) => p && !p.isAdmin).slice(0, 6);
  const audience = all.filter((p) => !p.isAdmin && !m.stage.includes(p.id));
  const raised = audience.filter((p) => m.hands[p.id]);
  const iRaised = !!m.hands[m.selfId];

  useEffect(() => { if (m.notice) toast(m.notice.text); }, [m.notice]); // eslint-disable-line
  useEffect(() => { if (!canSpeak && m.micOn) m.toggleMic(false); }, [canSpeak]); // eslint-disable-line

  // نص مباشر لكلامي (Web Speech API): اختياري، ويعمل حيث يدعمه المتصفح
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!cc || !m.micOn || !canSpeak || !SR) return undefined;
    let active = true;
    const r = new SR();
    r.lang = 'ar-SA';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) m.sendCaption(t); }
      }
    };
    r.onend = () => { if (active) { try { r.start(); } catch { /* يعمل بالفعل */ } } };
    try { r.start(); } catch { /* ignore */ }
    return () => { active = false; r.onend = null; try { r.stop(); } catch { /* ignore */ } };
  }, [cc, m.micOn, canSpeak]); // eslint-disable-line

  const onMic = () => {
    if (!canSpeak) return toast('ارفع يدك ليدعوك المضيف إلى المنصة.');
    m.toggleMic();
  };
  const toggleCc = () => {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return toast('متصفحك لا يدعم النص المباشر.');
    setCc((v) => !v);
  };
  const copyLink = async () => {
    const url = `${location.origin}/r/${room.roomName}`;
    try { await navigator.clipboard.writeText(url); toast('نُسخ رابط الدعوة.'); } catch { toast(url); }
  };

  const promote = (id) => m.setStage([...new Set([...m.stage, id])]);
  const demote = (id) => m.setStage(m.stage.filter((x) => x !== id));
  const capFresh = m.caption && m.now - m.caption.at < 9000;

  if (m.status === 'failed') {
    return <Failed onLeave={onLeave} code={m.fatal} />;
  }

  return (
    <section className="night room">
      <header className="room-top">
        <button className="icon-btn dark" onClick={onLeave} aria-label="تصغير الغرفة"><Icon name="down" /></button>
        <span className="pill live-pill"><i /> مباشر</span>
        <span className="pill dim"><Icon name="users" size={16} /> {ar(all.length)}</span>
        <button className="icon-btn dark sm" onClick={copyLink} aria-label="نسخ رابط الدعوة"><Icon name="link" size={18} /></button>
      </header>

      <h1 className="room-title">{room.title}</h1>
      <p className="room-sub">مجمع صوتي {since(room.createdAt, 'بدأ')}</p>

      <div className="stage" style={{ '--n': speakers.length }}>
        <i className="stage-ring r1" /><i className="stage-ring r2" /><i className="stage-ring r3" />
        <div className="seat host">
          <Avatar name={host?.name ?? room.hostName} size={150} speaking={host && m.isSpeaking(host.id)} muted={host?.id === m.selfId && !m.micOn} />
          <div className="host-label"><strong>{host?.id === m.selfId ? 'أنت' : (host?.name ?? room.hostName)}</strong><span className="tag">المضيف</span></div>
        </div>
        {speakers.map((p, i) => {
          const a = (-90 + (360 / speakers.length) * i) * (Math.PI / 180);
          return (
            <div key={p.id} className="seat" style={{ left: `${50 + Math.cos(a) * 41}%`, top: `${50 + Math.sin(a) * 41}%` }}>
              <Avatar name={p.name} size={74} speaking={m.isSpeaking(p.id)} muted={p.id === m.selfId && !m.micOn} />
              <span className="seat-name">{p.id === m.selfId ? 'أنت' : p.name}</span>
            </div>
          );
        })}
      </div>

      <div className="cc-card">
        <div className="cc-head">
          <span><Icon name="cc" size={18} /> {capFresh ? `نص مباشر من ${m.caption.name}` : 'النص المباشر'}</span>
          {canSpeak && <button className={`mini ${cc ? 'on' : ''}`} onClick={toggleCc} aria-pressed={cc}>{cc ? 'إيقاف نصّ صوتي' : 'تفعيل نصّ صوتي'}</button>}
        </div>
        <p>{capFresh ? m.caption.text : 'عندما يتحدث أحد المتحدثين وقد فعّل النص المباشر، تظهر كلماته هنا.'}</p>
      </div>

      <button className="audience" disabled={!isHost} onClick={() => setHandsOpen(true)}>
        <span className="stack">{audience.slice(0, 6).map((p) => <Avatar key={p.id} name={p.name} size={34} />)}</span>
        <span>{nListeners(audience.length)}{raised.length > 0 && `، ${ar(raised.length)} رفعوا أيديهم`}</span>
      </button>

      <div className="controls">
        <button className={`ctl ${iRaised ? 'active' : ''}`} onClick={m.toggleHand} aria-pressed={iRaised}>
          <span className="ctl-c"><Icon name="hand" size={26} /></span><small>{iRaised ? 'أنزل يدك' : 'ارفع يدك'}</small>
        </button>
        <button className={`ctl big ${m.micOn ? 'on' : ''} ${!canSpeak ? 'off' : ''}`} onClick={onMic} aria-pressed={m.micOn}>
          <span className="ctl-c"><Icon name={m.micOn ? 'mic' : 'micOff'} size={32} /></span><small>الميكروفون</small>
        </button>
        <div className="ctl-react">
          {reactOpen && (
            <div className="react-pop">{REACTS.map((e) => <button key={e} onClick={() => { m.react(e); setReactOpen(false); }}>{e}</button>)}</div>
          )}
          <button className="ctl" onClick={() => setReactOpen((v) => !v)} aria-expanded={reactOpen}>
            <span className="ctl-c"><Icon name="heart" size={24} /></span><small>تفاعل</small>
          </button>
        </div>
        <button className="ctl leave" onClick={onLeave}>
          <span className="ctl-c"><Icon name="x" size={26} /></span><small>غادر بهدوء</small>
        </button>
      </div>

      <div className="bursts" aria-hidden="true">{m.bursts.map((b) => <span key={b.id} style={{ left: `${b.x}%` }}>{b.e}</span>)}</div>

      {handsOpen && (
        <div className="sheet-wrap dark" onClick={() => setHandsOpen(false)}>
          <div className="sheet night-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <h2>إدارة المنصة</h2>
            <h3>رفعوا أيديهم</h3>
            {raised.length === 0 ? <p className="muted">لا أحد رفع يده الآن.</p> : raised.map((p) => (
              <div className="prow" key={p.id}><Avatar name={p.name} size={40} /><span>{p.name}</span><button className="mini on" onClick={() => promote(p.id)}>ادعُ للتحدث</button></div>
            ))}
            <h3>على المنصة</h3>
            {speakers.length === 0 ? <p className="muted">لا متحدثين غيرك.</p> : speakers.map((p) => (
              <div className="prow" key={p.id}><Avatar name={p.name} size={40} /><span>{p.name}</span><button className="mini" onClick={() => demote(p.id)}>أعدْه للمستمعين</button></div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function Failed({ onLeave, code }) {
  const text = code === 'SDK_MISSING'
    ? 'لم يُحمَّل Metered SDK. تحقق من اتصالك بالإنترنت وأن الصفحة تعمل عبر HTTPS.'
    : 'تعذّر الانضمام إلى الغرفة. ربما انتهت أو امتلأت.';
  return (
    <section className="night room center">
      <h1 className="room-title">لم نتمكن من الدخول</h1>
      <p className="room-sub">{text}</p>
      <button className="btn btn-sun" onClick={onLeave}>العودة للرئيسية</button>
    </section>
  );
}
