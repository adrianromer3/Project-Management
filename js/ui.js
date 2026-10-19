// Shared UI: labels & colours, formatters, small HTML builders, toasts, modals and charts.

import { esc } from './util.js';
import { settings } from './store.js';

// ---- Labels & colours ----------------------------------------------------

const GREY = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
const SKY = 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300';
const AMBER = 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
const GREEN = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300';
const ROSE = 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300';
const VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300';

export const PROJECT_STATUS = {
  planning: { label: 'Planning', cls: GREY },
  active: { label: 'Active', cls: SKY },
  'on-hold': { label: 'On hold', cls: AMBER },
  completed: { label: 'Completed', cls: GREEN },
};
export const TASK_STATUS = {
  todo: { label: 'To do', cls: GREY, color: '#94a3b8' },
  'in-progress': { label: 'In progress', cls: SKY, color: '#0ea5e9' },
  review: { label: 'Review', cls: VIOLET, color: '#8b5cf6' },
  done: { label: 'Done', cls: GREEN, color: '#10b981' },
};
export const PRIORITY = {
  low: { label: 'Low', cls: GREY },
  medium: { label: 'Medium', cls: SKY },
  high: { label: 'High', cls: AMBER },
  urgent: { label: 'Urgent', cls: ROSE },
};
export const HEALTH = {
  'on-track': { label: 'On track', cls: GREEN, color: '#10b981' },
  'at-risk': { label: 'At risk', cls: AMBER, color: '#f59e0b' },
  'off-track': { label: 'Off track', cls: ROSE, color: '#f43f5e' },
};
export const COST_CATEGORY = {
  labor: { label: 'Labour' },
  materials: { label: 'Materials' },
  equipment: { label: 'Equipment' },
  subcontract: { label: 'Subcontract' },
  other: { label: 'Other' },
};

export const options = (map) => Object.entries(map).map(([value, m]) => ({ value, label: m.label }));

// ---- Formatters ----------------------------------------------------------

export function fmtMoney(n, { compact = false } = {}) {
  const opts = { style: 'currency', currency: settings().currency || 'PHP', maximumFractionDigits: compact ? 1 : 0 };
  if (compact) opts.notation = 'compact';
  try { return new Intl.NumberFormat(undefined, opts).format(Number(n) || 0); } catch { return (Number(n) || 0).toLocaleString(); }
}
export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export const fmtPct = (n) => `${Math.round(Number(n) || 0)}%`;

// ---- HTML builders -------------------------------------------------------

export function badge(map, key) {
  const m = map[key];
  return `<span class="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${m?.cls || GREY}">${esc(m?.label || key)}</span>`;
}

export function progressBar(pct, color = 'bg-sky-500') {
  const w = Math.min(100, Math.max(0, Number(pct) || 0));
  return `<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow="${Math.round(w)}" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full ${color}" style="width:${w}%"></div></div>`;
}

// `cls` adds classes to the tile; `after` is extra HTML under the value (e.g. a progress bar).
export function kpi(label, value, sub = '', subCls = '', { cls = '', after = '' } = {}) {
  return `<div class="card p-4 ${cls}">
    <div class="text-xs font-medium text-slate-500 dark:text-slate-400">${esc(label)}</div>
    <div class="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">${esc(value)}</div>
    ${sub ? `<div class="mt-0.5 text-xs ${subCls || 'text-slate-500 dark:text-slate-400'}">${esc(sub)}</div>` : ''}
    ${after}
  </div>`;
}

export function card(title, body, cls = '', actions = '') {
  return `<section class="card min-w-0 p-4 ${cls}">
    <div class="mb-3 flex items-center gap-2"><h2 class="flex-1 text-sm font-semibold text-slate-900 dark:text-white">${esc(title)}</h2>${actions}</div>
    ${body}
  </section>`;
}

export function empty(title, text, action = '') {
  return `<div class="card mx-auto mt-6 max-w-md p-8 text-center">
    <div class="text-base font-semibold text-slate-900 dark:text-white">${esc(title)}</div>
    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${esc(text)}</p>
    ${action ? `<div class="mt-4">${action}</div>` : ''}
  </div>`;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ---- Toasts --------------------------------------------------------------

export function toast(msg, kind = 'ok') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg ${kind === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- Modals --------------------------------------------------------------

function modal(inner, setup) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const prevFocus = document.activeElement;
    root.innerHTML = `<div data-backdrop class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl">${inner}</div></div>`;
    const close = (v) => {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    const backdrop = root.querySelector('[data-backdrop]');
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(null); });
    root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => close(null)));
    setup(root, close);
  });
}

function fieldHtml(f) {
  const id = `f_${f.name}`;
  const span = f.full || f.type === 'textarea' ? 'sm:col-span-2' : '';
  if (f.type === 'checkbox') {
    return `<label class="flex items-center gap-2 text-sm ${span}"><input type="checkbox" name="${f.name}" class="h-4 w-4 rounded" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
  }
  const attrs = [f.required ? 'required' : '', f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '', f.step ? `step="${f.step}"` : '', f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''].join(' ');
  let input;
  if (f.type === 'select') {
    input = `<select id="${id}" name="${f.name}" class="input w-full" ${attrs}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${f.name}" rows="3" class="input w-full" ${attrs}>${esc(f.value ?? '')}</textarea>`;
  } else {
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" class="input w-full" ${attrs}>`;
  }
  return `<label class="block ${span}" for="${id}"><span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">${esc(f.label)}${f.required ? ' *' : ''}</span>${input}</label>`;
}

/**
 * Show a form and resolve with the values, null on cancel, or { __delete: true }
 * when `deletable` is set and Delete is clicked.
 * `validate(values)` may return an error message to block submit.
 */
export function formModal({ title, fields, submitLabel = 'Save', validate, deletable = false }) {
  const inner = `<form>
    <h2 class="mb-4 text-base font-semibold text-slate-900 dark:text-white">${esc(title)}</h2>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">${fields.map(fieldHtml).join('')}</div>
    <p data-error class="mt-3 hidden text-sm text-rose-600"></p>
    <div class="mt-5 flex items-center gap-2">
      ${deletable ? '<button type="button" data-delete class="btn text-rose-600">Delete</button>' : ''}
      <span class="flex-1"></span>
      <button type="button" data-cancel class="btn">Cancel</button>
      <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
    </div></form>`;
  return modal(inner, (root, close) => {
    const form = root.querySelector('form');
    const err = root.querySelector('[data-error]');
    root.querySelector('[data-delete]')?.addEventListener('click', () => close({ __delete: true }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        values[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value.trim();
      }
      const msg = validate?.(values);
      if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; }
      close(values);
    });
    form.querySelector('input:not([type=checkbox]),select,textarea')?.focus();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  const inner = `<h2 class="text-base font-semibold text-slate-900 dark:text-white">${esc(title)}</h2>
    <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">${esc(message)}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" data-cancel class="btn">Cancel</button>
      <button type="button" data-ok class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>
    </div>`;
  return modal(inner, (root, close) => {
    const ok = root.querySelector('[data-ok]');
    ok.addEventListener('click', () => close(true));
    ok.focus();
  }).then(Boolean);
}

// ---- Charts (Chart.js from CDN; pages degrade gracefully without it) ------

const charts = [];

export function chart(canvas, config) {
  if (!canvas) return null;
  if (!window.Chart) {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'text-sm text-slate-500', textContent: 'Charts unavailable (Chart.js did not load).' }));
    return null;
  }
  const c = new window.Chart(canvas, config);
  charts.push(c);
  return c;
}

export function destroyCharts() { while (charts.length) charts.pop().destroy(); }

export function applyChartTheme() {
  if (!window.Chart) return;
  const dark = document.documentElement.classList.contains('dark');
  window.Chart.defaults.color = dark ? '#94a3b8' : '#475569';
  window.Chart.defaults.borderColor = dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.15)';
  window.Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
}
