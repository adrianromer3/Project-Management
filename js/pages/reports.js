// Reports list: every project in view, each linking to its status report tab.

import * as store from '../store.js';
import { esc } from '../util.js';
import { PROJECT_STATUS, HEALTH, badge, progressBar, fmtDate, fmtPct, empty } from '../ui.js';

export function render(main) {
  const list = store.visibleProjects().sort((a, b) => String(a.code).localeCompare(String(b.code)));

  if (!list.length) {
    main.innerHTML = empty('No projects yet', `Nothing in ${store.scopeLabel()} yet.`, '<a class="btn" href="#/projects">Go to projects</a>');
    return 'Reports';
  }

  main.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Open a project's status report to add notes and export it to PDF, PowerPoint or Excel.</p>
    <div class="card mt-4 overflow-x-auto"><table class="w-full min-w-[760px] text-sm">
      <thead><tr class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <th class="px-4 py-2 font-medium">Project</th><th class="py-2 pr-3 font-medium">Region</th><th class="py-2 pr-3 font-medium">Project Manager</th>
        <th class="py-2 pr-3 font-medium">Status</th><th class="py-2 pr-3 font-medium">Health</th><th class="w-36 py-2 pr-3 font-medium">Progress</th>
        <th class="py-2 pr-3 text-right font-medium">Ends</th><th class="py-2 pr-4" aria-label="Report"></th>
      </tr></thead>
      <tbody>${list.map(row).join('')}</tbody>
    </table></div>`;
  return 'Reports';
}

function row(p) {
  const s = store.projectStats(p);
  const href = `#/projects/${p.id}/report`;
  return `<tr class="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
    <td class="px-4 py-2.5"><a href="${href}" class="font-medium text-slate-900 hover:text-sky-600 dark:text-white"><span class="mr-1.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">${esc(p.code)}</span>${esc(p.name)}</a></td>
    <td class="whitespace-nowrap py-2.5 pr-3">${esc(p.region || '—')}</td>
    <td class="py-2.5 pr-3">${esc(p.manager || '—')}</td>
    <td class="py-2.5 pr-3">${badge(PROJECT_STATUS, p.status)}</td>
    <td class="py-2.5 pr-3">${badge(HEALTH, s.health)}</td>
    <td class="py-2.5 pr-3"><div class="flex items-center gap-2"><div class="flex-1">${progressBar(s.progress)}</div><span class="w-9 text-right text-xs tabular-nums">${fmtPct(s.progress)}</span></div></td>
    <td class="whitespace-nowrap py-2.5 pr-3 text-right">${fmtDate(p.end)}</td>
    <td class="whitespace-nowrap py-2.5 pr-4 text-right"><a href="${href}" class="btn" aria-label="Open report for ${esc(p.name)}">Open report</a></td>
  </tr>`;
}
