// Portfolio overview: KPIs, budget vs actual, task status mix, project health and deadlines.

import * as store from '../store.js';
import { esc, sum, today, addDays, byDue } from '../util.js';
import { HEALTH, PROJECT_STATUS, TASK_STATUS, PRIORITY, badge, progressBar, kpi, card, empty, chart, fmtMoney, fmtDate, fmtPct } from '../ui.js';
import { newProject } from './projects.js';

export function render(main) {
  const projects = [...store.all('projects')].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (!projects.length) {
    main.innerHTML = empty('No projects yet', 'Create your first project to see the dashboard.', '<button data-action="new-project" class="btn btn-primary">+ New project</button>');
    main.querySelector('[data-action=new-project]').addEventListener('click', newProject);
    return 'Dashboard';
  }

  const stats = projects.map((p) => ({ p, s: store.projectStats(p) }));
  const live = stats.filter((x) => x.p.status !== 'completed');
  const t0 = today();
  const soon = addDays(t0, 14);
  const open = store.all('tasks').filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due && t.due < t0).sort(byDue);
  const upcoming = open.filter((t) => t.due && t.due >= t0 && t.due <= soon).sort(byDue);
  const budget = sum(live, (x) => x.p.budget);
  const spent = sum(live, (x) => x.s.spent);
  const avgProgress = live.length ? sum(live, (x) => x.s.progress) / live.length : 0;

  main.innerHTML = `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${kpi('Active projects', projects.filter((p) => p.status === 'active').length, `${projects.length} total`)}
      ${kpi('Open tasks', open.length, `${overdue.length} overdue`, overdue.length ? 'text-rose-600' : '')}
      ${kpi('Budget used', fmtPct(budget ? (spent / budget) * 100 : 0), `${fmtMoney(spent, { compact: true })} of ${fmtMoney(budget, { compact: true })} (open projects)`)}
      ${kpi('Avg. progress', fmtPct(avgProgress), 'open projects')}
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      ${card('Budget vs actual', '<div class="h-64"><canvas id="ch-budget" aria-label="Budget versus actual spend per project"></canvas></div>', 'lg:col-span-2')}
      ${card('Tasks by status', '<div class="h-64"><canvas id="ch-status" aria-label="Tasks by status"></canvas></div>')}
    </div>
    ${card('Project health', healthTable(stats), 'mt-4')}
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
      plugins: { tooltip: { callbacks: { title: (items) => projects[items[0].dataIndex].name, label: (c) => `${c.dataset.label}: ${fmtMoney(c.raw)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtMoney(v, { compact: true }) } }, x: { grid: { display: false } } },
    },
  });

  const all = store.all('tasks');
  chart(main.querySelector('#ch-status'), {
    type: 'doughnut',
    data: {
      labels: Object.values(TASK_STATUS).map((m) => m.label),
      datasets: [{ data: Object.keys(TASK_STATUS).map((k) => all.filter((t) => t.status === k).length), backgroundColor: Object.values(TASK_STATUS).map((m) => m.color), borderWidth: 0 }],
    },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } },
  });

  return 'Dashboard';
}

function healthTable(stats) {
  return `<div class="-mx-4 overflow-x-auto px-4"><table class="w-full min-w-[640px] text-sm">
    <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <th class="py-2 pr-3 font-medium">Project</th><th class="py-2 pr-3 font-medium">Status</th><th class="py-2 pr-3 font-medium">Health</th>
      <th class="w-40 py-2 pr-3 font-medium">Progress</th><th class="py-2 pr-3 text-right font-medium">Budget used</th><th class="py-2 text-right font-medium">Ends</th>
    </tr></thead>
    <tbody>${stats.map(({ p, s }) => `<tr class="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td class="py-2 pr-3"><a href="#/projects/${p.id}/board" class="font-medium text-slate-900 hover:text-sky-600 dark:text-white"><span class="text-slate-500">${esc(p.code)}</span> ${esc(p.name)}</a></td>
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
