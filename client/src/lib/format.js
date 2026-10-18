const DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const ar = (v) => String(v).replace(/\d/g, (d) => DIGITS[d]);

// المفرد، المثنى، من ٣ إلى ١٠، ١١ فأكثر
function plural(n, f) {
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  if (n >= 3 && n <= 10) return `${ar(n)} ${f[2]}`;
  return `${ar(n)} ${f[3]}`;
}
export const nListeners = (n) => (n === 0 ? 'لا مستمعين' : plural(n, ['مستمع واحد', 'مستمعان', 'مستمعين', 'مستمعاً']));
export const nPeople = (n) => (n === 0 ? 'لا أحد بعد' : plural(n, ['مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركاً']));

export function clock(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return ar(`${m}:${s}`);
}

export function since(ms, verb = 'بدأت') {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return `${verb} الآن`;
  if (m === 1) return `${verb} قبل دقيقة`;
  if (m === 2) return `${verb} قبل دقيقتين`;
  if (m <= 10) return `${verb} قبل ${ar(m)} دقائق`;
  if (m < 60) return `${verb} قبل ${ar(m)} دقيقة`;
  const h = Math.floor(m / 60);
  if (h === 1) return `${verb} قبل ساعة`;
  if (h === 2) return `${verb} قبل ساعتين`;
  return `${verb} قبل ${ar(h)} ${h <= 10 ? 'ساعات' : 'ساعة'}`;
}

export const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
