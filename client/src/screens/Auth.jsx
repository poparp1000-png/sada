import { useEffect, useState } from 'react';
import { api, errText } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function Auth({ initialMode = 'register', onDone, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);

  useEffect(() => { api.health().then(setHealth).catch(() => {}); }, []);

  const register = mode === 'register';
  const uname = username.trim().toLowerCase().replace(/^@/, '');
  const unameOk = USERNAME_RE.test(uname);
  const valid = unameOk && password.length >= (register ? 6 : 1) && (!register || name.trim().length > 0);

  const switchMode = (m) => { setMode(m); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const out = register
        ? await api.register({ name: name.trim(), username: uname, password })
        : await api.login({ username: uname, password });
      onDone(out);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <button type="button" className="icon-btn light" onClick={onBack} aria-label="رجوع"><Icon name="left" /></button>
      <h1 className="auth-title">{register ? 'أنشئ حسابك' : 'أهلاً بعودتك'}</h1>
      <p className="auth-sub">{register ? 'اسم مستخدم يجدك به أصدقاؤك، وكلمة مرور تحمي حسابك.' : 'سجّل الدخول لتصل إلى أصدقائك وغرفك.'}</p>

      <div className="seg two" role="tablist" aria-label="نوع الدخول">
        <button type="button" role="tab" aria-selected={!register} className={!register ? 'on' : ''} onClick={() => switchMode('login')}>دخول</button>
        <button type="button" role="tab" aria-selected={register} className={register ? 'on' : ''} onClick={() => switchMode('register')}>حساب جديد</button>
      </div>

      <form onSubmit={submit} noValidate>
        {register && (
          <>
            <label className="lbl" htmlFor="au-name">الاسم الظاهر</label>
            <input id="au-name" className="field" maxLength={40} autoComplete="name" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="مثال: ليلى" />
          </>
        )}

        <label className="lbl" htmlFor="au-user">اسم المستخدم</label>
        <input id="au-user" className="field ltr" dir="ltr" maxLength={21} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="layla_01" />
        {register && <p className={`hint-s ${username && !unameOk ? 'bad' : ''}`}>حروف إنجليزية صغيرة وأرقام و _ ، من ٣ إلى ٢٠ حرفاً.</p>}

        <label className="lbl" htmlFor="au-pass">كلمة المرور</label>
        <div className="field-wrap">
          <input id="au-pass" className="field ltr" dir="ltr" type={show ? 'text' : 'password'} maxLength={100}
            autoComplete={register ? 'new-password' : 'current-password'} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
          <button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
          </button>
        </div>
        {register && <p className="hint-s">٦ أحرف على الأقل.</p>}

        {error && <p className="err" role="alert">{error}</p>}

        <button className="btn btn-night auth-submit" disabled={!valid || busy}>
          {busy ? 'لحظة…' : register ? 'إنشاء الحساب' : 'دخول'}
        </button>
      </form>

      {register && health && health.persistent === false && (
        <p className="warn">تنبيه للمطوّر: التخزين مؤقت حالياً، فستُمسح الحسابات عند إعادة نشر الخادم. اربط قاعدة Postgres.</p>
      )}
    </main>
  );
}
