import Icon from './Icon.jsx';

const PALETTE = ['#B24FE0', '#FFB426', '#FF5A75', '#4DA3FF', '#7DCB4A', '#18B2A2'];
export const colorFor = (seed = '') => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/** أفاتار هندسي بلون ثابت لكل اسم. استبدله بصور المستخدمين لاحقاً. */
export default function Avatar({ name = '', size = 56, ring, speaking, muted, hand, className = '', style }) {
  return (
    <div
      className={`avatar ${ring ? 'ring' : ''} ${speaking ? 'speaking' : ''} ${className}`}
      style={{ '--s': `${size}px`, '--c': colorFor(name), ...style }}
      role="img"
      aria-label={name}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="38" r="17" />
        <path d="M14 100c0-22 16-34 36-34s36 12 36 34z" />
      </svg>
      {muted && <span className="avatar-badge"><Icon name="micOff" size={Math.max(12, size * 0.16)} /></span>}
      {hand && <span className="avatar-hand">✋</span>}
    </div>
  );
}
