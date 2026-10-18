import { useState } from 'react';
import Icon from '../components/Icon.jsx';

const AUDIENCE = [
  { id: 'everyone', label: 'الجميع', icon: 'globe' },
  { id: 'friends', label: 'أصدقائي', icon: 'users' },
  { id: 'invite', label: 'بدعوة', icon: 'lock' },
];

export default function NewRoom({ onClose, onCreate, busy }) {
  const [kind, setKind] = useState('audio');
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState('friends');
  const ok = title.trim().length > 0 && !busy;

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (ok) onCreate({ kind, title: title.trim(), visibility: vis }); }}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>ابدأ غرفة جديدة</h2>
          <button type="button" className="icon-btn light" onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button>
        </header>

        <div className="kinds" role="radiogroup" aria-label="نوع الغرفة">
          <button type="button" role="radio" aria-checked={kind === 'audio'} className={`kind ${kind === 'audio' ? 'on' : ''}`} onClick={() => setKind('audio')}>
            <span className="kind-ic lilac"><Icon name="mic" size={26} /></span>
            <strong>غرفة صوتية</strong><small>للحوار والاستماع</small>
          </button>
          <button type="button" role="radio" aria-checked={kind === 'video'} className={`kind ${kind === 'video' ? 'on' : ''}`} onClick={() => setKind('video')}>
            <span className="kind-ic sun"><Icon name="video" size={26} /></span>
            <strong>غرفة فيديو</strong><small>حتى ٨ على الكاميرا</small>
          </button>
        </div>

        <label className="lbl" htmlFor="rt">عن ماذا ستتحدثون؟</label>
        <div className="field-wrap">
          <input id="rt" className="field" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: سهرة شعر ونقاش" />
          <span className="count">{`${title.length}/60`.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])}</span>
        </div>

        <span className="lbl" id="aud">من يمكنه الانضمام؟</span>
        <div className="seg" role="radiogroup" aria-labelledby="aud">
          {AUDIENCE.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={vis === a.id} className={vis === a.id ? 'on' : ''} onClick={() => setVis(a.id)}>
              <Icon name={a.icon} size={18} /> {a.label}
            </button>
          ))}
        </div>

        <div className="sched">
          <span><Icon name="calendar" size={20} /> جدولة لوقت لاحق</span>
          <em>قريباً</em>
        </div>

        <button className="btn btn-sun" disabled={!ok}>
          {busy ? 'جارٍ إنشاء الغرفة…' : <>ابدأ الغرفة الآن <Icon name={kind === 'audio' ? 'mic' : 'video'} size={22} /></>}
        </button>
        <p className="hint">ستظهر غرفتك في الصفحة الرئيسية فور البدء.</p>
      </form>
    </div>
  );
}
