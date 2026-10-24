// Portfolio overview: KPIs, budget vs actual, task status mix, project health and deadlines.
// Scoped to "viewing as": Head Office gets a by-area breakdown, an Area Manager a
// by-project-manager breakdown; clicking a breakdown row drills down one level.

import * as store from '../store.js';
import { esc, sum, today, addDays, byDue } from '../util.js';
import { HEALTH, PROJECT_STATUS, TASK_STATUS, PRIORITY, badge, progressBar, kpi, card, empty, chart, initials, fmtMoney, fmtDate, fmtPct } from '../ui.js';
import { newProject } from './projects.js';
import { gantt, projectBars, legend } from '../gantt.js';

export function render(main) {
  const projects = [...store.visibleProjects()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const view = store.viewAs();
  if (!projects.length) {
    main.innerHTML = empty('No projects yet', store.all('projects').length ? `Nothing in ${store.scopeLabel()} yet.` : 'Create your first project to see the dashboard.', '<button data-action="new-project" class="btn btn-primary">+ New project</button>');
    main.querySelector('[data-action=new-project]').addEventListener('click', newProject);
    return 'Dashboard';
  }

  const stats = projects.map((p) => ({ p, s: store.projectStats(p) }));
  const live = stats.filter((x) => x.p.status !== 'completed');
  const t0 = today();
  const soon = addDays(t0, 14);
  const ids = new Set(projects.map((p) => p.id));
  const scopedTasks = store.all('tasks').filter((t) => ids.has(t.projectId));
  const open = scopedTasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due && t.due < t0).sort(byDue);
  const upcoming = open.filter((t) => t.due && t.due >= t0 && t.due <= soon).sort(byDue);
  const budget = sum(live, (x) => x.p.budget);
  const spent = sum(live, (x) => x.s.spent);
  const avgProgress = live.length ? sum(live, (x) => x.s.progress) / live.length : 0;
  const utilization = budget ? (spent / budget) * 100 : 0;
  const remaining = budget - spent;
  const utilColor = utilization > 100 ? 'bg-rose-500' : utilization >= 90 ? 'bg-amber-500' : 'bg-sky-500';
  // On phones the 3-tile rows are 2 columns with the last tile spanning both.
  const row = 'grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1';
  const budgetTile = { cls: 'border-l-4 !border-l-sky-500' };

  const breakdown = view.role === 'head' ? groupBy(stats, (p) => p.area || '', (k) => ({ label: k || 'No area', sub: store.areas().find((a) => a.name === k)?.manager || '—', drill: k && { role: 'area', area: k } }))
    : view.role === 'area' ? groupBy(stats, (p) => p.manager || '', (k) => ({ label: k || 'Unassigned', sub: `${stats.filter((x) => (x.p.manager || '') === k).length} project(s)`, drill: k && { role: 'pm', manager: k } }))
    : null;

  main.innerHTML = `
    ${scopeBar(view, projects)}
    <div class="${row}">
      ${kpi('Active projects', projects.filter((p) => p.status === 'active').length, `${projects.length} total`)}
      ${kpi('Open tasks', open.length, `${overdue.length} overdue`, overdue.length ? 'text-rose-600' : '')}
      ${kpi('Project Progress', fmtPct(avgProgress), 'average across on-going projects', '', { after: `<div class="mt-2">${progressBar(avgProgress)}</div>` })}
    </div>
    <h2 class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Budget · on-going projects</h2>
    <div class="${row}">
      ${kpi('Total Budget', fmtMoney(budget, { compact: true }), fmtMoney(budget), '', budgetTile)}
      ${kpi('Actual Spent', fmtMoney(spent, { compact: true }), `${fmtMoney(Math.abs(remaining), { compact: true })} ${remaining < 0 ? 'over budget' : 'remaining'}`, remaining < 0 ? 'text-rose-600' : '', budgetTile)}
      ${kpi('Budget Utilization', fmtPct(utilization), `${fmtMoney(spent, { compact: true })} of ${fmtMoney(budget, { compact: true })}`, utilization > 100 ? 'text-rose-600' : '', { ...budgetTile, after: `<div class="mt-2">${progressBar(utilization, utilColor)}</div>` })}
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      ${card('Budget vs actual', '<div class="h-64"><canvas id="ch-budget" aria-label="Budget versus actual spend per project"></canvas></div>', 'lg:col-span-2')}
      ${card('Tasks by status', '<div class="h-64"><canvas id="ch-status" aria-label="Tasks by status"></canvas></div>')}
    </div>
    ${card('Project Gantt Chart', portfolioGantt(live), 'mt-4', '<a href="#/gantt" class="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">Full Gantt chart →</a>')}
    ${breakdown ? card(view.role === 'head' ? 'By area' : 'By project manager', breakdownTable(breakdown, view.role === 'head' ? ['Area', 'Area Manager'] : ['Project Manager', 'Projects']), 'mt-4', '<span class="text-xs text-slate-500">Click a row to drill down</span>') : ''}
    ${card('Project health', healthTable(stats, view.role === 'head'), 'mt-4')}
    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      ${card(`Overdue tasks (${overdue.length})`, taskList(overdue, 'Nothing overdue.'))}
      ${card(`Due in the next 14 days (${upcoming.length})`, taskList(upcoming, 'Nothing due soon.'))}
    </div>`;

  chart(main.querySelector('#ch-budget'), {
    type: 'bar',
    data: {
      labels: projects.map((p) => p.code),
      datasets: [
        { label: 'Budget', data: projects.map((p) => p.budget), backgroundColor: '#94a3b8', borderRadius: 4 },
        { label: 'Spent', data: stats.map((x) => x.s.spent), backgroundColor: stats.map((x) => (x.s.spent > x.p.budget ? '#f43f5e' : '#0ea5e9')), borderRadius: 4 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { top: 18 } },
      plugins: { tooltip: { callbacks: { title: (items) => projects[items[0].dataIndex].name, label: (c) => `${c.dataset.label}: ${fmtMoney(c.raw)}` } } },
      scales: { y: { beginAtZero: true, grace: '8%', ticks: { callback: (v) => fmtMoney(v, { compact: true }) } }, x: { grid: { display: false } } },
    },
    plugins: [barValueLabels],
  });

  const statusCounts = Object.keys(TASK_STATUS).map((k) => scopedTasks.filter((t) => t.status === k).length);
  chart(main.querySelector('#ch-status'), {
    type: 'doughnut',
    data: {
      labels: Object.values(TASK_STATUS).map((m, i) => `${m.label} (${statusCounts[i]})`),
      datasets: [{ data: statusCounts, backgroundColor: Object.values(TASK_STATUS).map((m) => m.color), borderWidth: 0 }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => ` ${Object.values(TASK_STATUS)[c.dataIndex].label}: ${c.raw} task${c.raw === 1 ? '' : 's'}` } },
      },
    },
    plugins: [sliceValueLabels],
  });

  main.querySelectorAll('[data-drill]').forEach((el) => {
    const drill = () => store.setViewAs(JSON.parse(el.dataset.drill));
    el.addEventListener('click', drill);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') drill(); });
  });
  main.querySelector('[data-up]')?.addEventListener('click', (e) => store.setViewAs(JSON.parse(e.currentTarget.dataset.up)));

  return 'Dashboard';
}

// ---- Scope header & breakdown ----------------------------------------------

// Shows who the dashboard is for, with a link one level up the hierarchy.
function scopeBar(view, projects) {
  const areaName = view.role === 'pm' ? (projects.length && projects.every((p) => p.area === projects[0].area) ? projects[0].area : '') : view.area;
  const up = view.role === 'pm' && areaName ? { role: 'area', area: areaName } : view.role !== 'head' ? { role: 'head' } : null;
  const upLabel = up?.role === 'area' ? `↑ ${areaName} area` : '↑ Head Office';
  const areaCount = new Set(projects.map((p) => p.area).filter(Boolean)).size;
  const sub = view.role === 'head' ? `${projects.length} projects across ${areaCount} area${areaCount === 1 ? '' : 's'}`
    : view.role === 'area' ? `${projects.length} projects in ${esc(view.area)}`
    : projects.length === 1 ? `Project view · ${esc(projects[0].code)} ${esc(projects[0].name)}` : `${projects.length} projects managed`;
  return `<div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-900 dark:bg-sky-950/40">
    <span class="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">${esc(store.ROLES[view.role])}</span>
    <span class="font-medium text-slate-900 dark:text-white">${esc(view.role === 'head' ? 'All areas' : view.role === 'area' ? store.areas().find((a) => a.name === view.area)?.manager || view.area : view.manager)}</span>
    <span class="text-slate-500 dark:text-slate-400">${sub}</span>
    ${up ? `<button data-up='${esc(JSON.stringify(up))}' class="ml-auto text-xs font-medium text-sky-700 hover:underline dark:text-sky-400">${esc(upLabel)}</button>` : ''}
  </div>`;
}

function groupBy(stats, key, meta) {
  const groups = new Map();
  stats.forEach((x) => { const k = key(x.p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  return [...groups].sort(([a], [b]) => (a === '') - (b === '') || a.localeCompare(b)).map(([k, list]) => ({ ...meta(k), list }));
}

function breakdownTable(groups, [h1, h2]) {
  return `<div class="-mx-4 overflow-x-auto px-4"><table class="w-full min-w-[720px] text-sm">
    <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <th class="py-2 pr-3 font-medium">${h1}</th><th class="py-2 pr-3 font-medium">${h2}</th><th class="py-2 pr-3 text-right font-medium">On-going</th>
      <th class="py-2 pr-3 text-right font-medium">Budget</th><th class="py-2 pr-3 text-right font-medium">Spent</th><th class="py-2 pr-3 text-right font-medium">Utilization</th>
      <th class="w-36 py-2 pr-3 font-medium">Avg progress</th><th class="py-2 text-right font-medium">Need attention</th>
    </tr></thead>
    <tbody>${groups.map((g) => {
      const live = g.list.filter((x) => x.p.status !== 'completed');
      const budget = sum(live, (x) => x.p.budget);
      const spent = sum(live, (x) => x.s.spent);
      const util = budget ? (spent / budget) * 100 : 0;
      const prog = live.length ? sum(live, (x) => x.s.progress) / live.length : 0;
      const attention = live.filter((x) => x.s.health !== 'on-track').length;
      return `<tr ${g.drill ? `data-drill='${esc(JSON.stringify(g.drill))}' tabindex="0" role="button"` : ''} class="border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${g.drill ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''}">
        <td class="py-2 pr-3 font-medium text-slate-900 dark:text-white">${esc(g.label)}</td>
        <td class="py-2 pr-3">${esc(g.sub)}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${live.length}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${fmtMoney(budget, { compact: true })}</td>
        <td class="py-2 pr-3 text-right tabular-nums">${fmtMoney(spent, { compact: true })}</td>
        <td class="py-2 pr-3 text-right tabular-nums ${util > 100 ? 'text-rose-600' : ''}">${fmtPct(util)}</td>
        <td class="py-2 pr-3"><div class="flex items-center gap-2">${progressBar(prog)}<span class="w-9 text-right text-xs tabular-nums">${fmtPct(prog)}</span></div></td>
        <td class="py-2 text-right tabular-nums ${attention ? 'font-medium text-amber-600' : 'text-slate-500'}">${attention}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---- Chart.js label plugins -------------------------------------------------

// Writes each bar's amount (compact currency, e.g. ₱4.5M) just above the bar,
// shrinking the font on narrow screens so neighbouring labels don't collide.
const LABEL_FONT = (px) => `600 ${px}px Inter, ui-sans-serif, system-ui, sans-serif`;
const barValueLabels = {
  id: 'barValueLabels',
  afterDatasetsDraw(c) {
    const { ctx } = c;
    ctx.save();
    ctx.fillStyle = window.Chart.defaults.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    c.data.datasets.forEach((ds, i) => {
      if (!c.isDatasetVisible(i)) return;
      c.getDatasetMeta(i).data.forEach((bar, j) => {
        const v = Number(ds.data[j]) || 0;
        if (!v) return;
        const text = fmtMoney(v, { compact: true });
        ctx.font = LABEL_FONT(10);
        const px = Math.max(7, Math.min(10, Math.floor((10 * (bar.width + 4)) / ctx.measureText(text).width)));
        ctx.font = LABEL_FONT(px);
        ctx.fillText(text, bar.x, bar.y - 3);
      });
    });
    ctx.restore();
  },
};

// Writes each slice's count in the middle of the slice.
const sliceValueLabels = {
  id: 'sliceValueLabels',
  afterDatasetsDraw(c) {
    const { ctx } = c;
    const ds = c.data.datasets[0];
    ctx.save();
    ctx.font = '600 12px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    c.getDatasetMeta(0).data.forEach((arc, i) => {
      const v = Number(ds.data[i]) || 0;
      if (!v || !c.getDataVisibility(i)) return;
      const { x, y } = arc.tooltipPosition();
      ctx.fillText(String(v), x, y);
    });
    ctx.restore();
  },
};

// One row per on-going project: bar coloured by health and filled to progress, milestones as ◆.
function portfolioGantt(live) {
  const html = gantt(live.map(({ p, s }) => ({
    tall: true,
    label: `<a href="#/projects/${p.id}/timeline" class="block min-w-0 hover:text-sky-600">
      <span class="block truncate font-medium text-slate-900 dark:text-white"><span class="text-slate-500">${esc(p.code)}</span> ${esc(p.name)}</span>
      <span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(p.manager || 'Unassigned')} · ${fmtPct(s.progress)}</span></a>`,
    bars: projectBars(p, s),
  })), { labelHeader: 'Project' });
  return html ? `${html}${legend({ tasks: false, health: true })}` : '<p class="text-sm text-slate-500">No on-going projects with dates.</p>';
}

function healthTable(stats, showArea = false) {
  return `<div class="-mx-4 overflow-x-auto px-4"><table class="w-full min-w-[780px] text-sm">
    <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <th class="py-2 pr-3 font-medium">Project</th>${showArea ? '<th class="py-2 pr-3 font-medium">Area</th>' : ''}<th class="py-2 pr-3 font-medium">Project Manager</th><th class="py-2 pr-3 font-medium">Status</th><th class="py-2 pr-3 font-medium">Health</th>
      <th class="w-40 py-2 pr-3 font-medium">Progress</th><th class="py-2 pr-3 text-right font-medium">Budget Utilization</th><th class="py-2 text-right font-medium">Ends</th>
    </tr></thead>
    <tbody>${stats.map(({ p, s }) => `<tr class="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td class="py-2 pr-3"><a href="#/projects/${p.id}/board" class="font-medium text-slate-900 hover:text-sky-600 dark:text-white"><span class="text-slate-500">${esc(p.code)}</span> ${esc(p.name)}</a></td>
      ${showArea ? `<td class="whitespace-nowrap py-2 pr-3">${esc(p.area || '—')}</td>` : ''}
      <td class="whitespace-nowrap py-2 pr-3">${p.manager ? `<span class="inline-flex items-center gap-2"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">${esc(initials(p.manager))}</span>${esc(p.manager)}</span>` : '<span class="text-slate-400">Unassigned</span>'}</td>
      <td class="py-2 pr-3">${badge(PROJECT_STATUS, p.status)}</td>
      <td class="py-2 pr-3">${badge(HEALTH, s.health)}</td>
      <td class="py-2 pr-3"><div class="flex items-center gap-2">${progressBar(s.progress)}<span class="w-9 text-right text-xs tabular-nums">${fmtPct(s.progress)}</span></div></td>
      <td class="py-2 pr-3 text-right tabular-nums ${s.budgetUsed > 100 ? 'text-rose-600' : ''}">${fmtPct(s.budgetUsed)}</td>
      <td class="py-2 text-right">${fmtDate(p.end)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function taskList(tasks, none) {
  if (!tasks.length) return `<p class="text-sm text-slate-500 dark:text-slate-400">${esc(none)}</p>`;
  const t0 = today();
  return `<ul class="divide-y divide-slate-100 dark:divide-slate-800">${tasks.slice(0, 10).map((t) => {
    const p = store.get('projects', t.projectId);
    return `<li><a href="#/projects/${t.projectId}/board" class="flex items-center gap-3 py-2 hover:text-sky-600">
      <div class="min-w-0 flex-1"><div class="truncate text-sm font-medium">${t.milestone ? '◆ ' : ''}${esc(t.title)}</div>
      <div class="truncate text-xs text-slate-500 dark:text-slate-400">${esc(p?.code || '')} · ${esc(t.assignee || 'Unassigned')}</div></div>
      ${badge(PRIORITY, t.priority)}
      <span class="w-24 text-right text-xs tabular-nums ${t.due < t0 ? 'font-medium text-rose-600' : 'text-slate-500'}">${fmtDate(t.due)}</span></a></li>`;
  }).join('')}</ul>${tasks.length > 10 ? `<p class="mt-2 text-xs text-slate-500">+ ${tasks.length - 10} more</p>` : ''}`;
}
