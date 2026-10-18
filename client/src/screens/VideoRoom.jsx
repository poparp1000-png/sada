import { useEffect, useState } from 'react';
import { useMeeting } from '../lib/useMeeting.js';
import { nPeople } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import Tile from '../components/Tile.jsx';
import { Failed } from './AudioRoom.jsx';
import { ar } from '../lib/format.js';

const REACTS = ['❤️', '👏', '😂', '🔥'];

export default function VideoRoom({ join, me, onLeave, toast }) {
  const { roomURL, token, isHost, room } = join;
  const m = useMeeting({ roomURL, token, name: me.name, isHost, autoStart: { audio: true, video: true } });
  const [pop, setPop] = useState(false);
  const [text, setText] = useState('');
  const canShare = !!navigator.mediaDevices?.getDisplayMedia;

  useEffect(() => { if (m.notice) toast(m.notice.text); }, [m.notice]); // eslint-disable-line

  if (m.status === 'failed') return <Failed onLeave={onLeave} code={m.fatal} />;

  const all = Object.values(m.people);
  const lastSpoke = (p) => m.isSpeaking(p.id);
  const featured = all.find((p) => p.id !== m.selfId && lastSpoke(p)) || all.find((p) => p.id !== m.selfId) || all[0];
  const rest = all.filter((p) => p.id !== featured?.id);
  const cells = rest.length > 4 ? rest.slice(0, 3) : rest;
  const more = rest.length > 4 ? rest.slice(3) : [];
  const streamOf = (p) => (p.id === m.selfId ? m.localStream : m.streams[p.id]);
  const chatFresh = m.lastChat && m.now - m.lastChat.at < 8000;

  const tile = (p, big) => (
    <Tile key={p.id} person={p} big={big} self={p.id === m.selfId} stream={streamOf(p)}
      speaking={m.isSpeaking(p.id)} hand={m.hands[p.id]}
      micOff={p.id === m.selfId && !m.micOn} camOff={p.id === m.selfId && !m.camOn}
      caption={big && chatFresh ? `${m.lastChat.name}: ${m.lastChat.text}` : undefined} />
  );

  return (
    <section className="night room video">
      <header className="vr-top">
        <button className="icon-btn dark" onClick={onLeave} aria-label="تصغير"><Icon name="left" /></button>
        <div><h1>{room.title}</h1><p>{nPeople(all.length)} في الغرفة</p></div>
      </header>

      <div className="tiles">
        {featured && tile(featured, true)}
        <div className="tiles-grid">
          {cells.map((p) => tile(p, false))}
          {more.length > 0 && (
            <div className="tile more">
              <div className="stack">{more.slice(0, 4).map((p) => <span key={p.id} className="mini-av" style={{ background: 'var(--indigo)' }}>{p.name.slice(0, 1)}</span>)}</div>
              <strong>{ar(more.length)} مشاركين آخرين</strong>
            </div>
          )}
        </div>
      </div>

      <div className="dock">
        <button className="dk red" onClick={onLeave} aria-label="مغادرة"><Icon name="hangup" size={26} /></button>
        <div className="dk-wrap">
          {pop && (
            <div className="react-pop wide">
              <div>{REACTS.map((e) => <button key={e} onClick={() => { m.react(e); setPop(false); }}>{e}</button>)}</div>
              <form onSubmit={(e) => { e.preventDefault(); m.sendText(text); setText(''); setPop(false); }}>
                <input placeholder="اكتب رسالة" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
                <button aria-label="إرسال"><Icon name="send" size={18} /></button>
              </form>
            </div>
          )}
          <button className="dk" onClick={() => setPop((v) => !v)} aria-label="تفاعل أو رسالة" aria-expanded={pop}><Icon name="smile" size={24} /></button>
        </div>
        {canShare && <button className="dk" onClick={m.shareScreen} aria-label="مشاركة الشاشة"><Icon name="screen" size={24} /></button>}
        <button className={`dk ${m.camOn ? 'light' : ''}`} onClick={() => m.toggleCam()} aria-pressed={m.camOn} aria-label="الكاميرا"><Icon name={m.camOn ? 'video' : 'videoOff'} size={24} /></button>
        <button className={`dk ${m.micOn ? 'light' : ''}`} onClick={() => m.toggleMic()} aria-pressed={m.micOn} aria-label="الميكروفون"><Icon name={m.micOn ? 'mic' : 'micOff'} size={24} /></button>
      </div>

      <div className="bursts" aria-hidden="true">{m.bursts.map((b) => <span key={b.id} style={{ left: `${b.x}%` }}>{b.e}</span>)}</div>
    </section>
  );
}
