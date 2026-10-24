// App shell: hash router, sidebar nav, "viewing as" switcher, theme toggle, mobile drawer.
// Routes: #/dashboard · #/projects · #/projects/:id/:tab · #/gantt · #/settings

import * as store from './store.js';
import { esc } from './util.js';
import { destroyCharts, applyChartTheme } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as projects from './pages/projects.js';
import * as project from './pages/project.js';
import * as settings from './pages/settings.js';
import * as ganttPage from './pages/gantt.js';

const ICON = {
  dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  gantt: '<path d="M4 6h8M8 12h10M6 18h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
// Gantt sits under On-going Projects in the sidebar rather than in NAV.
const NAV = [['dashboard', 'Dashboard'], ['projects', 'Projects'], ['settings', 'Settings']];

const main = document.getElementById('main');

function route() {
  const [page = 'dashboard', id, tab] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page, id, tab };
}

function render() {
  const { page, id, tab } = route();
  destroyCharts();
  applyChartTheme();

  renderViewAs();
  let title;
  if (page === 'projects' && id) title = project.render(main, id, tab);
  else if (page === 'projects') title = projects.render(main);
  else if (page === 'settings') title = settings.render(main);
  else if (page === 'gantt') title = ganttPage.render(main);
  else title = dashboard.render(main);

  document.getElementById('page-title').textContent = title;
  document.title = `${title} · Project Management`;
  renderNav(['projects', 'settings', 'gantt'].includes(page) ? page : 'dashboard');
}

function renderNav(active) {
  const projects = store.visibleProjects().filter((p) => p.status !== 'completed')
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const { id } = route();
  document.getElementById('nav').innerHTML = `
    ${NAV.map(([k, label]) => `<a href="#/${k}" class="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 ${k === active && !id ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}" ${k === active ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${ICON[k]}</svg>${label}</a>`).join('')}
    <div class="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On-going Projects</div>
    <a href="#/gantt" class="mb-0.5 flex items-center gap-3 rounded-lg px-3 py-1.5 ${active === 'gantt' ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}" ${active === 'gantt' ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${ICON.gantt}</svg>Gantt chart (all)</a>
    ${projects.map((p) => `<a href="#/projects/${p.id}/board" class="flex items-center gap-2 rounded-lg px-3 py-1.5 ${p.id === id ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}">
      <span class="shrink-0 whitespace-nowrap text-[11px] text-slate-500">${esc(p.code)}</span><span class="truncate">${esc(p.name)}</span></a>`).join('')}`;
}

// ---- Viewing as (Head Office → Area Manager → Project Manager) --------------
// Option values: "head", "area:<region name>", "pm:<manager name>".

const viewAsSelect = document.getElementById('view-as');

function renderViewAs() {
  const v = store.viewAs();
  const cur = v.role === 'area' ? `area:${v.region}` : v.role === 'pm' ? `pm:${v.manager}` : 'head';
  const opt = (value, label) => `<option value="${esc(value)}" ${value === cur ? 'selected' : ''}>${esc(label)}</option>`;
  viewAsSelect.innerHTML = `${opt('head', `${store.ROLES.head} (all regions)`)}
    <optgroup label="${store.ROLES.area}">${store.regions().map((r) => opt(`area:${r.name}`, `${r.name} · ${r.manager || 'No area manager'}`)).join('')}</optgroup>
    <optgroup label="${store.ROLES.pm}">${store.projectManagers().map((m) => opt(`pm:${m}`, m)).join('')}</optgroup>`;
}

viewAsSelect.addEventListener('change', (e) => {
  const [role, ...rest] = e.target.value.split(':');
  const name = rest.join(':');
  store.setViewAs(role === 'area' ? { role, region: name } : role === 'pm' ? { role, manager: name } : { role: 'head' });

});

// ---- Theme & drawer --------------------------------------------------------

document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('pm:v1:theme', JSON.stringify(dark ? 'dark' : 'light')); } catch (e) { /* storage unavailable */ }
  render();
});

const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('drawer-backdrop');
const drawer = (open) => { sidebar.classList.toggle('-translate-x-full', !open); backdrop.classList.toggle('hidden', !open); };
document.getElementById('drawer-open').addEventListener('click', () => drawer(true));
document.getElementById('drawer-close').addEventListener('click', () => drawer(false));
backdrop.addEventListener('click', () => drawer(false));

// ---- Boot ------------------------------------------------------------------

let lastPage = '';
window.addEventListener('hashchange', () => {
  drawer(false);
  const key = location.hash.split('/').slice(0, 3).join('/');
  if (key !== lastPage) window.scrollTo(0, 0);
  lastPage = key;
  render();
});
store.subscribe(render);
if (!location.hash) history.replaceState(null, '', '#/dashboard');
render();
