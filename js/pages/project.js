// Project detail: header + summary, then Board / List / Timeline / Budget tabs.

import * as store from '../store.js';
import { esc, sum, today, addDays, daysBetween, byDue } from '../util.js';
import {
  PROJECT_STATUS, TASK_STATUS, PRIORITY, HEALTH, COST_CATEGORY, options,
  badge, progressBar, kpi, card, empty, initials, fmtMoney, fmtDate, fmtPct, formModal, confirmDialog, toast,
} from '../ui.js';
import { editProject, deleteProject } from './projects.js';
import { gantt, taskBar, sortTasks, legend } from '../gantt.js';

const TABS = [['board', 'Board'], ['list', 'List'], ['timeline', 'Timeline'], ['budget', 'Budget']];

export function render(main, id, tab) {
  const p = store.get('projects', id);
  if (!p) {
    main.innerHTML = empty('Project not found', 'It may have been deleted.', '<a class="btn" href="#/projects">Back to projects</a>');
    return 'Not found';
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'board';
  const s = store.projectStats(p);

  main.innerHTML = `
    <a href="#/projects" class="text-xs text-slate-500 hover:text-sky-600 dark:text-slate-400">← All projects</a>
    <div class="mt-2 flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2"><span class="text-sm font-medium text-slate-500 dark:text-slate-400">${esc(p.code)}</span>${badge(PROJECT_STATUS, p.status)}${badge(HEALTH, s.health)}</div>
        <h2 class="mt-1 text-xl font-semibold text-slate-900 dark:text-white">${esc(p.name)}</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${[p.client, p.manager && `PM: ${p.manager}`, `${fmtDate(p.start)} – ${fmtDate(p.end)}`].filter(Boolean).map(esc).join(' · ')}</p>
        ${p.description ? `<p class="mt-2 max-w-3xl text-sm">${esc(p.description)}</p>` : ''}
      </div>
      <div class="flex gap-2">
        <button data-action="edit" class="btn">Edit</button>
        <button data-action="delete" class="btn text-rose-600">Delete</button>
        <button data-action="add-task" class="btn btn-primary">+ Task</button>
      </div>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${kpi('Progress', fmtPct(s.progress), `${fmtPct(s.elapsed)} of schedule elapsed`)}
      ${kpi('Tasks done', `${s.done}/${s.total}`, s.overdue ? `${s.overdue} overdue` : 'none overdue', s.overdue ? 'text-rose-600' : '')}
      ${kpi('Spent', fmtMoney(s.spent, { compact: true }), `${fmtPct(s.budgetUsed)} of ${fmtMoney(p.budget, { compact: true })}`, s.budgetUsed > 100 ? 'text-rose-600' : '')}
      ${kpi('Days left', p.end ? Math.max(0, daysBetween(today(), p.end)) : '—', p.end ? `ends ${fmtDate(p.end)}` : '')}
    </div>
    <nav class="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Project views">
      ${TABS.map(([k, label]) => `<a href="#/projects/${p.id}/${k}" class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${k === tab ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}" ${k === tab ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    <div id="tab" class="mt-4"></div>`;

  main.querySelector('[data-action=edit]').addEventListener('click', () => editProject(p));
  main.querySelector('[data-action=delete]').addEventListener('click', () => deleteProject(p));
  main.querySelector('[data-action=add-task]').addEventListener('click', () => openTask(p));

  ({ board, list, timeline, budget })[tab](main.querySelector('#tab'), p, s);
  return p.name;
}

// ---- Task form -------------------------------------------------------------

function taskFields(t) {
  return [
    { name: 'title', label: 'Task', value: t.title, required: true, full: true },
    { name: 'assignee', label: 'Assignee', value: t.assignee },
    { name: 'priority', label: 'Priority', type: 'select', options: options(PRIORITY), value: t.priority },
    { name: 'status', label: 'Status', type: 'select', options: options(TASK_STATUS), value: t.status },
    { name: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100, step: 5, value: t.progress ?? 0 },
    { name: 'start', label: 'Start date', type: 'date', value: t.start },
    { name: 'due', label: 'Due date', type: 'date', value: t.due, required: true },
    { name: 'milestone', label: 'Milestone (shown as ◆ on the timeline)', type: 'checkbox', value: t.milestone, full: true },
    { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes },
  ];
}

async function openTask(p, t = null, defaults = {}) {
  const base = t || { status: 'todo', priority: 'medium', progress: 0, start: today(), due: addDays(today(), 7), ...defaults };
  const v = await formModal({
    title: t ? 'Edit task' : `New task · ${p.code}`,
    fields: taskFields(base),
    submitLabel: t ? 'Save' : 'Add task',
    deletable: !!t,
    validate: (x) => (x.start && x.due && x.due < x.start ? 'Due date must be on or after the start date.' : null),
  });
  if (!v) return;
  if (v.__delete) {
    if (await confirmDialog({ title: 'Delete task?', message: `"${t.title}" will be removed.`, confirmLabel: 'Delete', danger: true })) {
      store.remove('tasks', t.id);
      toast('Task deleted');
    }
    return;
  }
  if (v.status === 'done') v.progress = 100;
  if (t) { store.update('tasks', t.id, v); toast('Task saved'); } else { store.insert('tasks', { ...v, projectId: p.id }); toast('Task added'); }
}

function setStatus(t, status) {
  store.update('tasks', t.id, status === 'done' ? { status, progress: 100 } : { status });
}

// ---- Board -----------------------------------------------------------------

function board(el, p, s) {
  const t0 = today();
  const cardHtml = (t) => `<div draggable="true" tabindex="0" data-task="${t.id}" class="card p-3 text-sm shadow-sm hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500">
      <div class="font-medium text-slate-900 dark:text-white">${t.milestone ? '<span class="text-rose-500">◆</span> ' : ''}${esc(t.title)}</div>
      ${t.status === 'in-progress' || t.status === 'review' ? `<div class="mt-2">${progressBar(t.progress)}</div>` : ''}
      <div class="mt-2 flex items-center gap-2 text-xs">
        ${badge(PRIORITY, t.priority)}
        <span class="ml-auto tabular-nums ${t.status !== 'done' && t.due < t0 ? 'font-medium text-rose-600' : 'text-slate-500 dark:text-slate-400'}">${fmtDate(t.due)}</span>
        <span class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200" title="${esc(t.assignee || 'Unassigned')}">${esc(initials(t.assignee))}</span>
      </div></div>`;

  el.innerHTML = `<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">${Object.entries(TASK_STATUS).map(([k, m]) => {
    const ts = s.tasks.filter((t) => t.status === k).sort(byDue);
    return `<section data-col="${k}" class="flex min-h-[10rem] flex-col rounded-xl bg-slate-100 p-2 transition dark:bg-slate-900/60">
      <header class="flex items-center px-1 pb-2"><h3 class="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">${m.label} <span class="ml-1 font-normal">${ts.length}</span></h3>
        <button data-add="${k}" class="rounded px-2 text-lg leading-none text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Add task to ${m.label}">+</button></header>
      <div class="flex flex-1 flex-col gap-2">${ts.map(cardHtml).join('')}</div></section>`;
  }).join('')}</div>
  <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">Drag cards between columns to change status. Click a card to edit it.</p>`;

  el.querySelectorAll('[data-task]').forEach((c) => {
    const t = store.get('tasks', c.dataset.task);
    c.addEventListener('click', () => openTask(p, t));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTask(p, t); });
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  el.querySelectorAll('[data-col]').forEach((col) => {
    const hl = ['ring-2', 'ring-sky-400'];
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add(...hl); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove(...hl); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove(...hl);
      const t = store.get('tasks', e.dataTransfer.getData('text/plain'));
      if (t && t.status !== col.dataset.col) setStatus(t, col.dataset.col);
    });
  });
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => openTask(p, null, { status: b.dataset.add })));
}

// ---- List ------------------------------------------------------------------

function list(el, p, s) {
  if (!s.tasks.length) {
    el.innerHTML = empty('No tasks yet', 'Add the first task for this project.', '<button data-add class="btn btn-primary">+ Task</button>');
    el.querySelector('[data-add]').addEventListener('click', () => openTask(p));
    return;
  }
  const t0 = today();
  const rows = [...s.tasks].sort(byDue);
  el.innerHTML = `<div class="card overflow-x-auto"><table class="w-full min-w-[760px] text-sm">
    <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <th class="px-4 py-2 font-medium">Task</th><th class="px-3 py-2 font-medium">Assignee</th><th class="px-3 py-2 font-medium">Status</th>
      <th class="px-3 py-2 font-medium">Priority</th><th class="px-3 py-2 font-medium">Start</th><th class="px-3 py-2 font-medium">Due</th><th class="w-32 px-4 py-2 font-medium">Progress</th>
    </tr></thead>
    <tbody>${rows.map((t) => `<tr class="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td class="px-4 py-2"><button data-edit="${t.id}" class="text-left font-medium text-slate-900 hover:text-sky-600 dark:text-white">${t.milestone ? '<span class="text-rose-500">◆</span> ' : ''}${esc(t.title)}</button></td>
      <td class="px-3 py-2">${esc(t.assignee || '—')}</td>
      <td class="px-3 py-2"><select data-status="${t.id}" class="input py-1 text-xs" aria-label="Status">${options(TASK_STATUS).map((o) => `<option value="${o.value}" ${o.value === t.status ? 'selected' : ''}>${o.label}</option>`).join('')}</select></td>
      <td class="px-3 py-2">${badge(PRIORITY, t.priority)}</td>
      <td class="px-3 py-2 tabular-nums">${fmtDate(t.start)}</td>
      <td class="px-3 py-2 tabular-nums ${t.status !== 'done' && t.due < t0 ? 'font-medium text-rose-600' : ''}">${fmtDate(t.due)}</td>
      <td class="px-4 py-2"><div class="flex items-center gap-2">${progressBar(t.status === 'done' ? 100 : t.progress, t.status === 'done' ? 'bg-emerald-500' : 'bg-sky-500')}<span class="w-9 text-right text-xs tabular-nums">${fmtPct(t.status === 'done' ? 100 : t.progress)}</span></div></td>
    </tr>`).join('')}</tbody></table></div>`;

  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTask(p, store.get('tasks', b.dataset.edit))));
  el.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', () => setStatus(store.get('tasks', sel.dataset.status), sel.value)));
}

// ---- Timeline (Gantt) --------------------------------------------------------

function timeline(el, p, s) {
  const rows = [
    { label: `<span class="font-semibold">${esc(p.code)} · Project</span>`, bars: p.start && p.end ? [{ kind: 'span', start: p.start, end: p.end, tip: `${fmtDate(p.start)} – ${fmtDate(p.end)}` }] : [] },
    ...sortTasks(s.tasks).map((t) => ({
      label: `<button data-edit="${t.id}" class="w-full truncate text-left hover:text-sky-600" title="${esc(t.title)}">${esc(t.title)}</button>`,
      bars: [taskBar(t)],
    })),
  ];
  const chartHtml = gantt(rows);
  if (!chartHtml) {
    el.innerHTML = empty('Nothing to plot', 'Give the project or its tasks some dates to see the timeline.');
    return;
  }
  el.innerHTML = `<div class="card">${chartHtml}</div>${legend()}`;
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTask(p, store.get('tasks', b.dataset.edit))));
}

// ---- Budget ----------------------------------------------------------------

function costFields(c) {
  return [
    { name: 'date', label: 'Date', type: 'date', value: c.date, required: true },
    { name: 'category', label: 'Category', type: 'select', options: options(COST_CATEGORY), value: c.category },
    { name: 'description', label: 'Description', value: c.description, required: true, full: true },
    { name: 'amount', label: 'Amount', type: 'number', min: 0, step: '0.01', value: c.amount ?? '', required: true },
  ];
}

async function openCost(p, c = null) {
  const v = await formModal({
    title: c ? 'Edit cost entry' : `New cost · ${p.code}`,
    fields: costFields(c || { date: today(), category: 'materials' }),
    submitLabel: c ? 'Save' : 'Add cost',
    deletable: !!c,
  });
  if (!v) return;
  if (v.__delete) {
    if (await confirmDialog({ title: 'Delete cost entry?', message: `"${c.description}" (${fmtMoney(c.amount)}) will be removed.`, confirmLabel: 'Delete', danger: true })) {
      store.remove('costs', c.id);
      toast('Cost entry deleted');
    }
    return;
  }
  if (c) { store.update('costs', c.id, v); toast('Cost entry saved'); } else { store.insert('costs', { ...v, projectId: p.id }); toast('Cost entry added'); }
}

function budget(el, p, s) {
  const over = s.remaining < 0;
  const byCat = Object.entries(COST_CATEGORY)
    .map(([k, m]) => ({ label: m.label, amt: sum(s.costs.filter((c) => c.category === k), (c) => c.amount) }))
    .filter((x) => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);
  const rows = [...s.costs].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  el.innerHTML = `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${kpi('Budget', fmtMoney(p.budget))}
      ${kpi('Spent', fmtMoney(s.spent), `${s.costs.length} entries`)}
      ${kpi(over ? 'Over budget' : 'Remaining', fmtMoney(Math.abs(s.remaining)), over ? 'variance' : '', over ? 'text-rose-600' : '')}
      ${kpi('Budget used', fmtPct(s.budgetUsed), `vs ${fmtPct(s.progress)} work complete`, s.budgetUsed > s.progress + 15 ? 'text-amber-600' : '')}
    </div>
    <div class="mt-4">${progressBar(s.budgetUsed, over ? 'bg-rose-500' : s.budgetUsed >= 90 ? 'bg-amber-500' : 'bg-sky-500')}</div>
    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      ${card('Spend by category', byCat.length ? `<ul class="space-y-3">${byCat.map((x) => `<li>
        <div class="flex justify-between text-sm"><span>${esc(x.label)}</span><span class="tabular-nums">${fmtMoney(x.amt)}</span></div>
        <div class="mt-1">${progressBar(s.spent ? (x.amt / s.spent) * 100 : 0)}</div></li>`).join('')}</ul>`
        : '<p class="text-sm text-slate-500">No costs recorded yet.</p>')}
      ${card('Cost entries', rows.length ? `<div class="-mx-4 overflow-x-auto"><table class="w-full min-w-[440px] text-sm">
        <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <th class="px-4 py-2 font-medium">Date</th><th class="px-3 py-2 font-medium">Category</th><th class="px-3 py-2 font-medium">Description</th><th class="px-4 py-2 text-right font-medium">Amount</th></tr></thead>
        <tbody>${rows.map((c) => `<tr data-cost="${c.id}" tabindex="0" class="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
          <td class="whitespace-nowrap px-4 py-2 tabular-nums">${fmtDate(c.date)}</td>
          <td class="px-3 py-2">${esc(COST_CATEGORY[c.category]?.label || c.category)}</td>
          <td class="px-3 py-2">${esc(c.description)}</td>
          <td class="px-4 py-2 text-right tabular-nums">${fmtMoney(c.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="px-4 py-2 text-right text-xs font-medium text-slate-500">Total</td><td class="px-4 py-2 text-right font-semibold tabular-nums">${fmtMoney(s.spent)}</td></tr></tfoot>
        </table></div>` : '<p class="text-sm text-slate-500">No costs recorded yet.</p>', 'lg:col-span-2', '<button data-add-cost class="btn btn-sm btn-primary">+ Cost</button>')}
    </div>`;

  el.querySelector('[data-add-cost]').addEventListener('click', () => openCost(p));
  el.querySelectorAll('[data-cost]').forEach((r) => {
    const open = () => openCost(p, store.get('costs', r.dataset.cost));
    r.addEventListener('click', open);
    r.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}
