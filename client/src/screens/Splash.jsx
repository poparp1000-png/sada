import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const ORBIT = [
  { n: 'نور', x: 9, y: 17 }, { n: 'مها', x: 50, y: 6, halo: true }, { n: 'سارة', x: 91, y: 17 },
  { n: 'هند', x: 6, y: 47 }, { n: 'خالد', x: 94, y: 47 },
  { n: 'ريم', x: 9, y: 77 }, { n: 'يوسف', x: 50, y: 88, halo: true }, { n: 'فهد', x: 91, y: 77 },
];

export default function Splash({ onDone }) {
  const [step, setStep] = useState('intro');
  const [name, setName] = useState('');
  const ok = name.trim().length > 0;

  return (
    <main className="splash">
      <div className="splash-stage" aria-hidden="true">
        <i className="r r3" /><i className="r r2" /><i className="r r1" />
        <div className="splash-core"><span /><span /><span /><span /><span /></div>
        {ORBIT.map((o) => (
          <div key={o.n} className={`orbit ${o.halo ? 'halo' : ''}`} style={{ left: `${o.x}%`, top: `${o.y}%` }}>
            <Avatar name={o.n} size={64} ring />
          </div>
        ))}
      </div>

      <h1 className="splash-brand">صدى</h1>
      <h2 className="splash-title">صوتك أجمل<br />من الرسائل</h2>
      <p className="splash-sub">مكالمات صوتية وفيديو، وغرف مفتوحة تجمعك بمن يشبهك.</p>

      {step === 'intro' ? (
        <button className="btn btn-night" onClick={() => setStep('name')}>
          ابدأ بالصوت <Icon name="mic" size={22} />
        </button>
      ) : (
        <form className="splash-form" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(name.trim()); }}>
          <label htmlFor="nm" className="sr">اسمك</label>
          <input id="nm" className="field" autoFocus maxLength={40} placeholder="بماذا نناديك؟"
            value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-night" disabled={!ok}>ادخل</button>
        </form>
      )}
      <p className="legal">بمتابعتك توافق على الشروط وسياسة الخصوصية</p>
    </main>
  );
}
