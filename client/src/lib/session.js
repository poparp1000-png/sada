const KEY = 'sada.auth';

export function loadAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY));
    return a?.token && a?.user?.id ? a : null;
  } catch { return null; }
}
export const saveAuth = (a) => localStorage.setItem(KEY, JSON.stringify(a));
export function clearAuth() {
  localStorage.removeItem(KEY);
  localStorage.removeItem('sada.profile'); // مفتاح النسخة القديمة (اسم فقط)
}
