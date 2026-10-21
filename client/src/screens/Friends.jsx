import { useCallback, useEffect, useState } from 'react';
import { api, errText } from '../lib/api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const LABEL = { available: 'متاح للمكالمة', room: 'في غرفة الآن', busy: 'عدم الإزعاج', offline: 'غير متصل' };

export default function Friends({ onCall, toast, onChanged }) {
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // id الصديق المنتظر تأكيد حذفه

  const load = useCallback(async () => {
    try { setData(await api.friends()); } catch { /* الخطأ 401 يعالجه التطبيق، والباقي مؤقت */ }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const u = name.trim().replace(/^@/, '').toLowerCase();
    if (!u || busy) return;
    setBusy(true);
    try {
      const r = await api.friendRequest({ username: u });
      toast(r.status === 'accepted' ? `أنت و${r.user.name} الآن صديقان.` : `أُرسل الطلب إلى ${r.user.name}.`);
      setName('');
      await load();
      onChanged?.();
    } catch (err) {
      toast(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.friendRemove(id);
      setConfirm(null);
      await load();
      onChanged?.();
    } catch (err) { toast(errText(err)); }
  };

  const friends = data?.friends ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <>
      <h1 className="big pad">الأصدقاء</h1>

      <form className="add-friend" onSubmit={add}>
        <label className="sr" htmlFor="fr-user">اسم مستخدم صديقك</label>
        <input id="fr-user" className="field ltr" dir="ltr" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          maxLength={21} value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم مستخدم صديقك" />
        <button className="btn btn-night slim" disabled={!name.trim() || busy} aria-label="إرسال طلب صداقة">
          <Icon name="userPlus" size={20} /> أضف
        </button>
      </form>

      {!data ? <div className="empty">جارٍ التحميل…</div>
        : friends.length === 0 ? (
          <div className="empty"><p>لا أصدقاء بعد. اكتب اسم مستخدم صديقك في الأعلى لإرسال طلب.</p></div>
        ) : (
          <div className="rows">
            {friends.map((f) => (
              <div className="row frow" key={f.id}>
                <span className="fav"><Avatar name={f.name} size={52} /><i className={`pdot ${f.presence}`} /></span>
                <span className="row-main"><strong>{f.name}</strong><small>@{f.username} · {LABEL[f.presence]}</small></span>
                {confirm === f.id ? (
                  <span className="confirm">
                    <button className="mini danger" onClick={() => remove(f.id)}>حذف</button>
                    <button className="mini" onClick={() => setConfirm(null)}>إلغاء</button>
                  </span>
                ) : (
                  <>
                    <button className="icon-btn light sm" disabled={f.presence !== 'available'} onClick={() => onCall(f)} aria-label={`اتصال بـ${f.name}`}><Icon name="phone" size={18} /></button>
                    <button className="icon-btn light sm" onClick={() => setConfirm(f.id)} aria-label={`حذف ${f.name}`}><Icon name="x" size={18} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

      {outgoing.length > 0 && (
        <section className="friends">
          <div className="friends-head"><h2>طلبات أرسلتها</h2></div>
          <div className="rows">
            {outgoing.map((u) => (
              <div className="row" key={u.id}>
                <Avatar name={u.name} size={44} />
                <span className="row-main"><strong>{u.name}</strong><small>@{u.username} · بانتظار الرد</small></span>
                <button className="mini" onClick={() => remove(u.id)}>إلغاء</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
