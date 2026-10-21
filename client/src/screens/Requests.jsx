import { useCallback, useEffect, useState } from 'react';
import { api, errText } from '../lib/api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

export default function Requests({ toast, onChanged }) {
  const [list, setList] = useState(null);

  const load = useCallback(async () => {
    try { setList((await api.friends()).incoming); } catch { /* مؤقت */ }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn, okMsg) => {
    try { await fn(); toast(okMsg); await load(); onChanged?.(); } catch (e) { toast(errText(e)); }
  };

  return (
    <>
      <h1 className="big pad">الإشعارات</h1>
      {list === null ? <div className="empty">جارٍ التحميل…</div>
        : list.length === 0 ? <div className="empty"><p>لا إشعارات جديدة. ستظهر هنا طلبات الصداقة.</p></div>
          : (
            <div className="rows">
              {list.map((u) => (
                <div className="row" key={u.id}>
                  <Avatar name={u.name} size={48} />
                  <span className="row-main"><strong>{u.name}</strong><small>@{u.username} يريد إضافتك صديقاً</small></span>
                  <button className="icon-btn sun sm" onClick={() => act(() => api.friendAccept({ id: u.id }), `أنت و${u.name} الآن صديقان.`)} aria-label={`قبول ${u.name}`}><Icon name="check" size={18} /></button>
                  <button className="icon-btn light sm" onClick={() => act(() => api.friendRemove(u.id), 'تم رفض الطلب.')} aria-label={`رفض ${u.name}`}><Icon name="x" size={18} /></button>
                </div>
              ))}
            </div>
          )}
    </>
  );
}
