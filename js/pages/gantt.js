// Gantt chart for every on-going (not completed) project, each followed by its tasks.

import * as store from '../store.js';
import { esc } from '../util.js';
import { HEALTH, badge, empty, fmtPct } from '../ui.js';
import { gantt, projectBars, taskBar, sortTasks, legend } from '../gantt.js';

let showTasks = true;

export function render(main) {
  const live = store.all('projects')
    .filter((p) => p.status !== 'completed')
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map((p) => ({ p, s: store.projectStats(p) }));

  if (!live.length) {
    main.innerHTML = empty('No on-going projects', 'Projects that are not completed appear here.', '<a class="btn" href="#/projects">Go to projects</a>');
    return 'Gantt Chart';
  }

  const rows = live.flatMap(({ p, s }) => [
    {
      tall: true,
      cls: 'bg-slate-50 dark:bg-slate-800/30',
      label: `<a href="#/projects/${p.id}/timeline" class="block min-w-0 hover:text-sky-600">
        <span class="block truncate font-semibold text-slate-900 dark:text-white"><span class="text-slate-500">${esc(p.code)}</span> ${esc(p.name)}</span>
        <span class="block truncate text-xs text-slate-500 dark:text-slate-400">${esc(p.manager || 'Unassigned')} · ${fmtPct(s.progress)}</span></a>`,
      bars: projectBars(p, s, { milestones: !showTasks }),
    },
    ...(showTasks ? sortTasks(s.tasks).map((t) => ({
      label: `<a href="#/projects/${p.id}/timeline" class="block truncate pl-4 text-slate-600 hover:text-sky-600 dark:text-slate-300" title="${esc(t.title)}">${esc(t.title)}</a>`,
      bars: [taskBar(t)],
    })) : []),
  ]);

  main.innerHTML = `
    <div class="flex flex-wrap items-center gap-3">
      <p class="flex-1 text-sm text-slate-500 dark:text-slate-400">${live.length} on-going project${live.length === 1 ? '' : 's'} · ${live.map(({ s }) => s.health).filter((h) => h !== 'on-track').length} need attention</p>
      <label class="flex items-center gap-2 text-sm"><input id="show-tasks" type="checkbox" class="h-4 w-4 rounded" ${showTasks ? 'checked' : ''}> Show tasks</label>
    </div>
    <div class="mt-3 flex flex-wrap gap-2">${live.map(({ p, s }) => `<a href="#/projects/${p.id}/timeline" class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs hover:border-sky-400 dark:border-slate-700">${esc(p.code)} ${badge(HEALTH, s.health)}</a>`).join('')}</div>
    <div class="card mt-4">${gantt(rows, { labelHeader: showTasks ? 'Project / task' : 'Project' }) || '<p class="p-4 text-sm text-slate-500">No dates to plot.</p>'}</div>
    ${legend({ tasks: showTasks, health: true })}`;

  main.querySelector('#show-tasks').addEventListener('change', (e) => { showTasks = e.target.checked; render(main); });
  return 'Gantt Chart';
}
