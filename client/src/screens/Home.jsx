import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ar, greeting, nListeners, nPeople } from '../lib/format.js';
import { useLongPress } from '../lib/useLongPress.js';
import Avatar from '../components/Avatar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import Icon from '../components/Icon.jsx';

const FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'audio', label: 'صوتية' },
  { id: 'video', label: 'فيديو' },
  { id: 'friends', label: 'أصدقائي' },
];
const SIZES = [4, 3, 3, 2, 2, 2, 2, 2];
const AUDIO_COLORS = ['lilac', 'rose', 'mint'];
const VIDEO_COLORS = ['sun', 'sky'];
const STATUS = {
  available: { label: 'أستقبل المكالمات', dot: 'mint' },
  busy: { label: 'عدم الإزعاج', dot: 'coral' },
};

function Bubbles({ rooms, onEnter }) {
  const used = { audio: 0, video: 0 };
  return (
    <div className="bubbles-wrap">
      <div className="bubbles">
        {rooms.slice(0, SIZES.length).map((r, i) => {
          const size = SIZES[i];
          const pal = r.kind === 'audio' ? AUDIO_COLORS : VIDEO_COLORS;
          const color = pal[used[r.kind]++ % pal.length];
          const count = r.kind === 'audio' ? nListeners(r.count) : nPeople(r.count);
          return (
            <button key={r.roomName} className={`bubble ${r.kind} s${size} ${color}`} onClick={() => onEnter(r.roomName)}
              aria-label={`${r.title}، ${count}`}>
              {size === 4 && r.count > 0 && r.kind === 'audio' && <span className="live"><i /> مباشر</span>}
              {size >= 3 && r.kind === 'video' && <span className="kind-tag"><Icon name="video" size={16} /> فيديو</span>}
              <strong className="b-title">{r.title}</strong>
              {size >= 3 ? <span className="b-count">{count}</span>
                : <span className="b-count"><Icon name={r.kind === 'audio' ? 'mic' : 'video'} size={14} /> {ar(r.count)}</span>}
              {size === 4 && <Avatar name={r.hostName} size={44} ring />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Friend({ f, onCall, toast }) {
  const lp = useLongPress(() => onCall(f));
  return (
    <button className="friend" {...lp.handlers} onClick={() => { if (!lp.wasLong()) toast(`اضغط مطولاً على ${f.name} للاتصال به.`); }}>
      <Avatar name={f.name} size={64} ring />
      <span>{f.name}</span>
    </button>
  );
}

function RoomRow({ r, onEnter }) {
  return (
    <button className="row" onClick={() => onEnter(r.roomName)}>
      <span className={`row-ic ${r.kind === 'audio' ? 'lilac' : 'sun'}`}><Icon name={r.kind === 'audio' ? 'mic' : 'video'} size={22} /></span>
      <span className="row-main"><strong>{r.title}</strong><small>{r.kind === 'audio' ? nListeners(r.count) : nPeople(r.count)}</small></span>
      <Icon name="left" size={20} />
    </button>
  );
}

export default function Home({ profile, status, setStatus, tab, setTab, net, onEnter, onNew, onCall, onAccept, onDecline, onRename, toast }) {
  const [filter, setFilter] = useState('all');
  const [rooms, setRooms] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const d = await api.rooms();
        if (!stop) { setRooms(d.rooms); setConfigured(d.configured); setLoading(false); }
      } catch { if (!stop) setLoading(false); }
    };
    load();
    const t = setInterval(load, 6000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const shown = rooms.filter((r) => (filter === 'all' ? true : filter === 'friends' ? r.visibility === 'friends' : r.kind === filter));

  return (
    <>
      <div className="scroll home">
        {!configured && (
          <div className="banner" role="alert">
            لم تُضبط مفاتيح Metered بعد، لذلك لن تعمل الغرف والمكالمات. أضفها في <code>server/.env</code>.
          </div>
        )}

        {tab === 'home' && (
          <>
            <header className="home-head">
              <button className="me-btn" onClick={() => setTab('me')} aria-label="حسابي">
                <Avatar name={profile.name} size={58} />
                <i className={`dot ${STATUS[status].dot}`} />
              </button>
              <div>
                <p className="greet">{greeting()} يا {profile.name}</p>
                <h1 className="big">من يتحدث الآن؟</h1>
              </div>
            </header>

            <div className="status-wrap">
              <button className="pill-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
                <i className={`dot ${STATUS[status].dot}`} /> {STATUS[status].label} <Icon name="down" size={16} />
              </button>
              {menu && (
                <ul className="menu" role="menu">
                  {Object.entries(STATUS).map(([id, s]) => (
                    <li key={id}><button role="menuitem" onClick={() => { setStatus(id); setMenu(false); }}><i className={`dot ${s.dot}`} /> {s.label}</button></li>
                  ))}
                </ul>
              )}
            </div>

            <div className="chips" role="tablist" aria-label="تصفية الغرف">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>

            {loading ? <div className="empty">جارٍ التحميل…</div>
              : shown.length === 0 ? (
                <div className="empty">
                  <p>لا توجد غرف الآن.</p>
                  <button className="btn btn-night slim" onClick={onNew}>ابدأ أول غرفة</button>
                </div>
              ) : <Bubbles rooms={shown} onEnter={onEnter} />}

            <div className="legend">
              <span><i className="lg round" /> غرفة صوتية</span>
              <span><i className="lg sq" /> غرفة فيديو</span>
            </div>

            <section className="friends">
              <div className="friends-head"><h2>متاحون للكلام الآن</h2><small>اضغط مطولاً لمكالمة سريعة</small></div>
              {net.online.length === 0
                ? <p className="muted">لا أحد متاح الآن. سيظهر هنا من يفتح التطبيق.</p>
                : <div className="friends-row">{net.online.map((f) => <Friend key={f.id} f={f} onCall={onCall} toast={toast} />)}</div>}
            </section>
          </>
        )}

        {tab === 'rooms' && (
          <>
            <h1 className="big pad">كل الغرف</h1>
            {rooms.length === 0 ? <div className="empty"><p>لا توجد غرف الآن.</p><button className="btn btn-night slim" onClick={onNew}>ابدأ غرفة</button></div>
              : <div className="rows">{rooms.map((r) => <RoomRow key={r.roomName} r={r} onEnter={onEnter} />)}</div>}
          </>
        )}

        {tab === 'notes' && (
          <>
            <h1 className="big pad">الإشعارات</h1>
            <div className="empty"><p>لا إشعارات جديدة. ستصلك هنا دعوات الغرف والمكالمات الفائتة.</p></div>
          </>
        )}

        {tab === 'me' && (
          <>
            <h1 className="big pad">حسابي</h1>
            <div className="me-card">
              <Avatar name={profile.name} size={96} />
              <form onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) { onRename(nameDraft.trim()); toast('تم حفظ الاسم.'); } }}>
                <label className="lbl" htmlFor="myname">الاسم الظاهر للآخرين</label>
                <input id="myname" className="field" maxLength={40} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
                <button className="btn btn-night slim" disabled={!nameDraft.trim() || nameDraft.trim() === profile.name}>حفظ الاسم</button>
              </form>
            </div>
          </>
        )}
      </div>

      <BottomNav tab={tab} onTab={setTab} onTalk={onNew} />

      {net.incoming && (
        <div className="call-in" role="alertdialog" aria-label="مكالمة واردة">
          <Avatar name={net.incoming.fromName} size={96} speaking />
          <h2>{net.incoming.fromName}</h2>
          <p>يتصل بك الآن</p>
          <div className="call-in-actions">
            <button className="round red" onClick={onDecline} aria-label="رفض"><Icon name="hangup" size={28} /></button>
            <button className="round green" onClick={() => onAccept(net.incoming)} aria-label="قبول"><Icon name="phone" size={28} /></button>
          </div>
        </div>
      )}
    </>
  );
}
