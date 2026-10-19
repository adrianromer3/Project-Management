// Small, dependency-free helpers. Dates are ISO "YYYY-MM-DD" strings in local time.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(n) || 0));

export const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function isoDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export const today = () => isoDate(new Date());

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000);
}

export const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
