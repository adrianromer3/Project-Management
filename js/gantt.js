// Shared Gantt renderer used by the project Timeline tab, the dashboard and the Gantt page.
//
// gantt(rows) takes rows of { label: html, tall?: bool, cls?: string, bars: [bar] } where a bar is
// { start, end, kind: 'bar' | 'milestone' | 'span', color, fill (0-100), late, tip }.
// The date range is fitted to every bar, with month gridlines and a today line.

import { esc, today, addDays, daysBetween, isoDate } from './util.js';
import { TASK_STATUS, HEALTH, fmtDate, fmtPct } from './ui.js';

export function gantt(rows, { labelHeader = 'Task', minWidth = 760 } = {}) {
  const dates = rows.flatMap((r) => r.bars.flatMap((b) => [b.start, b.end])).filter(Boolean).sort();
  if (!dates.length) return null;

  const min = addDays(dates[0], -3);
  const max = addDays(dates[dates.length - 1], 3);
  const total = daysBetween(min, max) + 1;
  const pos = (iso) => (daysBetween(min, iso) / total) * 100;
  const span = (a, b) => ((daysBetween(a, b) + 1) / total) * 100;
  const t0 = today();

  const months = [];
  const d = new Date(`${min}T00:00:00`);
  d.setDate(1);
  while (isoDate(d) <= max) {
    const next = new Date(d);
    next.setMonth(next.getMonth() + 1);
    const a = isoDate(d) < min ? min : isoDate(d);
    const lastDay = addDays(isoDate(next), -1);
    const b = lastDay > max ? max : lastDay;
    months.push({ label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), left: pos(a), width: span(a, b) });
    d.setTime(next.getTime());
  }

  const grid = months.map((m) => `<div class="absolute inset-y-0 border-l border-slate-100 dark:border-slate-800/70" style="left:${m.left}%"></div>`).join('');
  const now = t0 >= min && t0 <= max ? `<div class="absolute inset-y-0 w-0.5 bg-rose-500/70" style="left:${pos(t0)}%"></div>` : '';

  const barHtml = (b) => {
    const tip = b.tip ? `title="${esc(b.tip)}"` : '';
    if (b.kind === 'milestone') {
      return `<div class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45" style="left:${pos(b.end) + span(b.end, b.end) / 2}%;background:${b.color}" ${tip}></div>`;
    }
    if (b.kind === 'span') {
      return `<div class="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-400 dark:bg-slate-600" style="left:${pos(b.start)}%;width:${span(b.start, b.end)}%" ${tip}></div>`;
    }
    return `<div class="absolute top-1/2 ${b.thick ? 'h-5' : 'h-4'} -translate-y-1/2 overflow-hidden rounded ${b.late ? 'ring-2 ring-rose-500' : ''}" style="left:${pos(b.start)}%;width:${Math.max(span(b.start, b.end), 0.6)}%;background:${b.color}40" ${tip}>
      <div class="h-full" style="width:${Math.min(100, Math.max(0, b.fill || 0))}%;background:${b.color}"></div></div>`;
  };

  const LABEL_W = 'w-48 sm:w-64';
  return `<div class="overflow-x-auto"><div style="min-width:${minWidth}px">
    <div class="flex border-b border-slate-200 dark:border-slate-800">
      <div class="${LABEL_W} shrink-0 px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">${esc(labelHeader)}</div>
      <div class="relative h-8 flex-1">${months.map((m) => `<div class="absolute inset-y-0 truncate border-l border-slate-200 px-1.5 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400" style="left:${m.left}%;width:${m.width}%">${esc(m.label)}</div>`).join('')}</div>
    </div>
    ${rows.map((r) => `<div class="flex ${r.tall ? 'h-12' : 'h-10'} items-center border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${r.cls || ''}">
      <div class="${LABEL_W} min-w-0 shrink-0 px-4 text-sm">${r.label}</div>
      <div class="relative h-full flex-1">${grid}${now}${r.bars.map(barHtml).join('')}</div></div>`).join('')}
  </div></div>`;
}

// ---- Bar builders ------------------------------------------------------------

export function taskBar(t) {
  const start = t.milestone ? (t.due || t.start) : (t.start || t.due);
  const end = t.due || t.start;
  const status = TASK_STATUS[t.status];
  const tip = `${t.title} · ${status?.label || t.status} · ${fmtDate(start)} – ${fmtDate(end)}`;
  if (t.milestone) return { kind: 'milestone', start: end, end, color: t.status === 'done' ? '#10b981' : '#f43f5e', tip: `◆ ${tip}` };
  return {
    kind: 'bar', start, end, tip,
    color: status?.color || '#94a3b8',
    fill: t.status === 'done' ? 100 : Number(t.progress) || 0,
    late: t.status !== 'done' && t.due && t.due < today(),
  };
}

// Project bar coloured by health and filled to progress, plus its milestones as diamonds.
export function projectBars(p, s, { milestones = true } = {}) {
  const bars = [];
  if (p.start && p.end) {
    bars.push({
      kind: 'bar', thick: true, start: p.start, end: p.end,
      color: HEALTH[s.health]?.color || '#0ea5e9', fill: s.progress,
      tip: `${p.code} ${p.name} · ${HEALTH[s.health]?.label} · ${fmtPct(s.progress)} done · ${fmtDate(p.start)} – ${fmtDate(p.end)}`,
    });
  }
  if (milestones) s.tasks.filter((t) => t.milestone && (t.due || t.start)).forEach((t) => bars.push(taskBar(t)));
  return bars;
}

export const sortTasks = (tasks) => tasks
  .filter((t) => t.due || t.start)
  .sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due) || (a.due || '').localeCompare(b.due || ''));

// ---- Legends -----------------------------------------------------------------

const chip = (style, cls, label) => `<span class="flex items-center gap-1.5"><span class="${cls}" style="${style}"></span>${esc(label)}</span>`;
const common = [
  chip('', 'h-2.5 w-2.5 rotate-45 bg-rose-500', 'Milestone'),
  chip('', 'h-3 w-0.5 bg-rose-500', 'Today'),
];

export function legend({ tasks = true, health = false } = {}) {
  const items = [];
  if (health) items.push(...Object.values(HEALTH).map((m) => chip(`background:${m.color}`, 'h-2.5 w-2.5 rounded-sm', `Project ${m.label.toLowerCase()}`)));
  if (tasks) {
    items.push(...Object.values(TASK_STATUS).map((m) => chip(`background:${m.color}`, 'h-2.5 w-2.5 rounded-sm', m.label)));
    items.push(chip('', 'h-2.5 w-2.5 rounded-sm ring-2 ring-rose-500', 'Overdue'));
  }
  items.push(...common);
  return `<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">${items.join('')}</div>`;
}
