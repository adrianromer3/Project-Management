// Projects list (search + status filter) and the shared project create/edit/delete flows.

import * as store from '../store.js';
import { esc, today, addDays } from '../util.js';
import { PROJECT_STATUS, HEALTH, badge, progressBar, fmtMoney, fmtDate, fmtPct, formModal, confirmDialog, toast, options, empty } from '../ui.js';

let q = '';
let status = '';

export function render(main) {
  main.innerHTML = `<div class="flex flex-wrap items-center gap-2">
      <input id="pq" type="search" placeholder="Search projects…" aria-label="Search projects" class="input w-full sm:w-64" value="${esc(q)}">
      <select id="ps" class="input" aria-label="Filter by status"><option value="">All statuses</option>${options(PROJECT_STATUS).map((o) => `<option value="${o.value}" ${o.value === status ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
      <button data-action="new-project" class="btn btn-primary sm:ml-auto">+ New project</button>
    </div>
    <div id="grid" class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"></div>`;

  const grid = main.querySelector('#grid');
  const draw = () => {
    const needle = q.trim().toLowerCase();
    const list = store.all('projects')
      .filter((p) => !status || p.status === status)
      .filter((p) => !needle || [p.code, p.name, p.client, p.manager].some((v) => String(v || '').toLowerCase().includes(needle)))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    grid.innerHTML = list.length
      ? list.map(projectCard).join('')
      : `<div class="sm:col-span-2 xl:col-span-3">${empty(store.all('projects').length ? 'No matching projects' : 'No projects yet', store.all('projects').length ? 'Try a different search or status.' : 'Create your first project to get started.')}</div>`;
  };

  main.querySelector('#pq').addEventListener('input', (e) => { q = e.target.value; draw(); });
  main.querySelector('#ps').addEventListener('change', (e) => { status = e.target.value; draw(); });
  main.querySelector('[data-action=new-project]').addEventListener('click', newProject);
  draw();
  return 'Projects';
}

function projectCard(p) {
  const s = store.projectStats(p);
  return `<a href="#/projects/${p.id}/board" class="card block p-4 transition hover:border-sky-400 hover:shadow-sm dark:hover:border-sky-500">
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">${esc(p.code)}${p.client ? ` · ${esc(p.client)}` : ''}</div>
        <div class="truncate font-semibold text-slate-900 dark:text-white">${esc(p.name)}</div>
      </div>
      ${badge(HEALTH, s.health)}
    </div>
    <div class="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>Progress</span><span class="tabular-nums">${fmtPct(s.progress)}</span></div>
    <div class="mt-1">${progressBar(s.progress)}</div>
    <dl class="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div><dt class="text-slate-500 dark:text-slate-400">Tasks</dt><dd class="tabular-nums font-medium">${s.done}/${s.total}${s.overdue ? ` <span class="text-rose-600">· ${s.overdue} late</span>` : ''}</dd></div>
      <div><dt class="text-slate-500 dark:text-slate-400">Budget used</dt><dd class="tabular-nums font-medium ${s.budgetUsed > 100 ? 'text-rose-600' : ''}">${fmtPct(s.budgetUsed)}</dd></div>
      <div><dt class="text-slate-500 dark:text-slate-400">Ends</dt><dd class="font-medium">${fmtDate(p.end)}</dd></div>
    </dl>
    <div class="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">${badge(PROJECT_STATUS, p.status)}<span class="truncate">${esc(p.manager || '')}</span><span class="ml-auto tabular-nums">${fmtMoney(p.budget, { compact: true })}</span></div>
  </a>`;
}

// ---- Shared create / edit / delete --------------------------------------

function projectFields(p) {
  return [
    { name: 'code', label: 'Code', value: p.code, required: true },
    { name: 'status', label: 'Status', type: 'select', options: options(PROJECT_STATUS), value: p.status },
    { name: 'name', label: 'Project name', value: p.name, required: true, full: true },
    { name: 'client', label: 'Client / department', value: p.client },
    { name: 'manager', label: 'Project manager', value: p.manager },
    { name: 'start', label: 'Start date', type: 'date', value: p.start, required: true },
    { name: 'end', label: 'End date', type: 'date', value: p.end, required: true },
    { name: 'budget', label: 'Budget', type: 'number', min: 0, step: '0.01', value: p.budget ?? 0 },
    { name: 'description', label: 'Description', type: 'textarea', value: p.description },
  ];
}

const validateProject = (v) => (v.end < v.start ? 'End date must be on or after the start date.' : null);

export async function newProject() {
  const v = await formModal({
    title: 'New project',
    fields: projectFields({ code: store.nextProjectCode(), status: 'planning', start: today(), end: addDays(today(), 90) }),
    submitLabel: 'Create project',
    validate: validateProject,
  });
  if (!v) return;
  const p = store.insert('projects', v);
  toast(`Created ${p.code}`);
  location.hash = `#/projects/${p.id}/board`;
}

export async function editProject(p) {
  const v = await formModal({ title: `Edit ${p.code}`, fields: projectFields(p), validate: validateProject });
  if (!v) return;
  store.update('projects', p.id, v);
  toast('Project saved');
}

export async function deleteProject(p) {
  const ok = await confirmDialog({
    title: `Delete ${p.code}?`,
    message: `"${p.name}" and all of its tasks and cost entries will be removed. This cannot be undone.`,
    confirmLabel: 'Delete project',
    danger: true,
  });
  if (!ok) return;
  location.hash = '#/projects';
  store.remove('projects', p.id);
  toast('Project deleted');
}
