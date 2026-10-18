import { useEffect, useRef, useState } from 'react';
import { useMeeting } from '../lib/useMeeting.js';
import { clock } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { Failed } from './AudioRoom.jsx';

function Video({ stream, mirror }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream ?? null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={mirror} className={mirror ? 'mirror' : ''} />;
}

export default function DirectCall({ join, me, onLeave, toast }) {
  const { roomURL, token, room } = join;
  const peerName = room.callerId === me.id ? room.calleeName : room.callerName;
  const m = useMeeting({ roomURL, token, name: me.name, autoStart: { audio: true, video: true } });
  const [secs, setSecs] = useState(0);

  const peer = Object.values(m.people).find((p) => p.id !== m.selfId);
  const peerStream = peer ? m.streams[peer.id] : null;
  const poor = m.status === 'network_connection_lost';

  useEffect(() => { if (m.notice) toast(m.notice.text); }, [m.notice]); // eslint-disable-line
  useEffect(() => {
    if (!peer) return undefined;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [!!peer]); // eslint-disable-line
  // انتهت المكالمة عندما يغادر الطرف الآخر بعد أن كان موجوداً
  const hadPeer = useRef(false);
  useEffect(() => {
    if (peer) hadPeer.current = true;
    else if (hadPeer.current) { toast(`${peerName} أنهى المكالمة.`); onLeave(); }
  }, [!!peer]); // eslint-disable-line

  if (m.status === 'failed') return <Failed onLeave={onLeave} code={m.fatal} />;

  return (
    <section className="call">
      <div className="call-bg">
        {peerStream ? <Video stream={peerStream} />
          : <div className="call-wait"><Avatar name={peerName} size={150} speaking={!!peer} /><p>{peer ? `${peerName} بدون كاميرا` : `جارٍ الاتصال بـ${peerName}…`}</p></div>}
      </div>

      <header className="call-top">
        <span className={`quality ${poor ? 'bad' : ''}`}>{poor ? 'ضعيف' : 'ممتاز'}<i className="bars"><b /><b /><b /></i></span>
        <div className="call-id"><strong>{peerName}</strong><span>{clock(secs)}</span></div>
        <button className="icon-btn dark" onClick={onLeave} aria-label="تصغير"><Icon name="down" /></button>
      </header>

      {m.camOn && (
        <div className="pip">
          <Video stream={m.localStream} mirror />
          <button onClick={m.flipCam} aria-label="تبديل الكاميرا"><Icon name="flip" size={18} /></button>
        </div>
      )}

      {m.camOn && <button className="voice-only" onClick={() => m.toggleCam(false)}>التحويل إلى صوت فقط <i className="bars y"><b /><b /><b /><b /></i></button>}

      <div className="dock call-dock">
        <button className="dk red wide" onClick={onLeave} aria-label="إنهاء"><Icon name="hangup" size={28} /></button>
        <button className="dk" onClick={m.flipCam} aria-label="تبديل الكاميرا"><Icon name="flip" size={24} /></button>
        <button className={`dk ${m.camOn ? '' : 'light'}`} onClick={() => m.toggleCam()} aria-label="الكاميرا"><Icon name={m.camOn ? 'video' : 'videoOff'} size={24} /></button>
        <button className={`dk ${m.micOn ? 'light' : ''}`} onClick={() => m.toggleMic()} aria-pressed={m.micOn} aria-label="الميكروفون"><Icon name={m.micOn ? 'mic' : 'micOff'} size={24} /></button>
      </div>
    </section>
  );
}
