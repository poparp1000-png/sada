import Icon from './Icon.jsx';

const ITEMS = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'friends', label: 'الأصدقاء', icon: 'users' },
  { id: 'talk', label: 'تحدّث', icon: 'mic', fab: true },
  { id: 'notes', label: 'الإشعارات', icon: 'bell', badge: true },
  { id: 'me', label: 'حسابي', icon: 'user' },
];

export default function BottomNav({ tab, onTab, onTalk, badge = 0 }) {
  return (
    <nav className="bottom-nav" aria-label="التنقل الرئيسي">
      {ITEMS.map((it) =>
        it.fab ? (
          <button key={it.id} className="nav-fab" onClick={onTalk} aria-label="ابدأ غرفة جديدة">
            <span className="fab-disc"><Icon name="mic" size={30} /></span>
            <span className="nav-label">{it.label}</span>
          </button>
        ) : (
          <button key={it.id} className={`nav-item ${tab === it.id ? 'on' : ''}`} onClick={() => onTab(it.id)}
            aria-current={tab === it.id ? 'page' : undefined}>
            <Icon name={it.icon} size={24} />
            {it.badge && badge > 0 && <span className="nav-badge" aria-label={`${badge} جديد`}>{badge > 9 ? '٩+' : String(badge).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])}</span>}
            <span className="nav-label">{it.label}</span>
          </button>
        ),
      )}
    </nav>
  );
}
