// localStorage-backed data store. Three collections (projects, tasks, costs) plus settings.
// Every write goes through commit(), which saves and notifies subscribers (the app re-renders).
// Settings also hold the regions (each with an area manager) and the current "viewing as" scope.

import { uid, clamp, sum, today, addDays, daysBetween } from './util.js';

const KEY = 'pm:v1:data';
const VERSION = 2;
const COLLECTIONS = ['projects', 'tasks', 'costs'];
export const REGIONS = ['Metro North', 'Metro South', 'Visayas', 'Mindanao', 'North Luzon', 'South Luzon'];
const DEFAULT_SETTINGS = { currency: 'PHP', regions: [], viewAs: { role: 'head' } };
const listeners = new Set();

let state = load();

function blank() {
  return { version: VERSION, settings: { ...DEFAULT_SETTINGS, regions: REGIONS.map((name) => ({ name, manager: '' })) }, projects: [], tasks: [], costs: [] };
}

// Also upgrades saved data and imported backups from older versions.
function normalize(d) {
  const s = blank();
  if (!d || typeof d !== 'object') return s;
  for (const c of COLLECTIONS) s[c] = Array.isArray(d[c]) ? d[c] : [];
  s.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  if ((Number(d.version) || 1) < 2) migrateAreasToRegions(s);
  if (!Array.isArray(s.settings.regions)) s.settings.regions = [];
  if (!s.settings.viewAs?.role) s.settings.viewAs = { role: 'head' };
  return s;
}

// v1 called regions "areas" (settings.areas, project.area, viewAs.area). Existing areas
// are kept as regions, and the standard regions are added after them.
function migrateAreasToRegions(s) {
  const old = Array.isArray(s.settings.areas) ? s.settings.areas : [];
  s.settings.regions = [...old, ...REGIONS.filter((n) => !old.some((a) => a.name === n)).map((name) => ({ name, manager: '' }))];
  delete s.settings.areas;
  s.projects.forEach((p) => {
    if ('area' in p) { p.region = p.area || ''; delete p.area; }
  });
  const v = s.settings.viewAs;
  if (v?.role === 'area') s.settings.viewAs = { role: 'area', region: v.area };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data, starting with sample data', e);
  }
  const s = sample();
  persist(s);
  return s;
}

function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn('Could not save data', e); }
}

function commit() {
  persist(state);
  listeners.forEach((fn) => fn());
}

// ---- CRUD ----------------------------------------------------------------

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const all = (c) => state[c];
export const get = (c, id) => state[c].find((r) => r.id === id);
export const tasksOf = (projectId) => state.tasks.filter((t) => t.projectId === projectId);
export const costsOf = (projectId) => state.costs.filter((x) => x.projectId === projectId);

export function insert(c, rec) {
  const r = { id: uid(c.slice(0, -1)), ...rec, createdAt: new Date().toISOString() };
  state[c].push(r);
  commit();
  return r;
}

export function update(c, id, patch) {
  const r = get(c, id);
  if (!r) return null;
  Object.assign(r, patch, { updatedAt: new Date().toISOString() });
  commit();
  return r;
}

export function remove(c, id) {
  state[c] = state[c].filter((r) => r.id !== id);
  if (c === 'projects') {
    state.tasks = state.tasks.filter((t) => t.projectId !== id);
    state.costs = state.costs.filter((x) => x.projectId !== id);
  }
  commit();
}

export const settings = () => state.settings;
export function setSettings(patch) { Object.assign(state.settings, patch); commit(); }

// ---- Regions & viewing scope ----------------------------------------------
// Hierarchy: Head Office sees every region, an Area Manager sees the projects
// in their region, a Project Manager sees only the projects they manage.

export const ROLES = { head: 'Head Office', area: 'Area Manager', pm: 'Project Manager' };

export const regions = () => state.settings.regions;
export const regionOf = (p) => regions().find((r) => r.name === p.region);

// Saving under a new name moves that region's projects (and the current scope) along with it.
export function saveRegion(oldName, region) {
  const list = state.settings.regions;
  const i = list.findIndex((r) => r.name === oldName);
  if (i >= 0) list[i] = region; else list.push(region);
  if (oldName && oldName !== region.name) {
    state.projects.forEach((p) => { if (p.region === oldName) p.region = region.name; });
    if (state.settings.viewAs.region === oldName) state.settings.viewAs = { role: 'area', region: region.name };
  }
  commit();
}

export function removeRegion(name) {
  state.settings.regions = state.settings.regions.filter((r) => r.name !== name);
  state.projects.forEach((p) => { if (p.region === name) p.region = ''; });
  if (state.settings.viewAs.region === name) state.settings.viewAs = { role: 'head' };
  commit();
}

export const projectManagers = () => [...new Set(state.projects.map((p) => p.manager).filter(Boolean))].sort();

// A saved scope whose region or project manager no longer exists falls back to Head Office,
// so the dashboard never filters on someone the "Viewing as" menu can't show.
export function viewAs() {
  const v = state.settings.viewAs;
  if (v.role === 'area' && regions().some((r) => r.name === v.region)) return v;
  if (v.role === 'pm' && projectManagers().includes(v.manager)) return v;
  return { role: 'head' };
}
export function setViewAs(v) { state.settings.viewAs = v; commit(); }

export function inScope(p, v = viewAs()) {
  if (v.role === 'area') return p.region === v.region;
  if (v.role === 'pm') return p.manager === v.manager;
  return true;
}

export const visibleProjects = () => state.projects.filter((p) => inScope(p));

export function scopeLabel(v = viewAs()) {
  if (v.role === 'area') return `${ROLES.area} · ${regions().find((r) => r.name === v.region)?.manager || 'Unassigned'} (${v.region})`;
  if (v.role === 'pm') return `${ROLES.pm} · ${v.manager}`;
  return `${ROLES.head} · All regions`;
}

export function nextProjectCode() {
  const n = Math.max(0, ...state.projects.map((p) => parseInt(String(p.code).replace(/\D/g, ''), 10) || 0));
  return `PRJ-${String(n + 1).padStart(3, '0')}`;
}

// ---- Import / export -----------------------------------------------------

export const exportData = () => JSON.stringify(state, null, 2);

export function importData(text) {
  const d = JSON.parse(text);
  if (!d || !COLLECTIONS.every((c) => Array.isArray(d[c]))) throw new Error('This file is not a Project Management export (missing projects, tasks or costs).');
  state = normalize(d);
  commit();
}

export function resetSample() { state = sample(); commit(); }

export function clearAll() {
  const keep = state.settings;
  state = blank();
  state.settings = { ...keep, viewAs: { role: 'head' } };
  commit();
}

// ---- Metrics -------------------------------------------------------------

// Health: off-track = over budget or past end date; at-risk = overdue tasks,
// ≥90% of budget spent, or schedule elapsed is >20 points ahead of completion.
export function projectStats(p) {
  const t0 = today();
  const tasks = tasksOf(p.id);
  const costs = costsOf(p.id);
  const done = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.length
    ? sum(tasks, (t) => (t.status === 'done' ? 100 : clamp(t.progress))) / tasks.length
    : (p.status === 'completed' ? 100 : 0);
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due && t.due < t0).length;
  const spent = sum(costs, (x) => x.amount);
  const budget = Number(p.budget) || 0;
  const budgetUsed = budget ? (spent / budget) * 100 : 0;
  const elapsed = p.start && p.end ? clamp((daysBetween(p.start, t0) / Math.max(1, daysBetween(p.start, p.end))) * 100) : 0;

  let health = 'on-track';
  const late = p.end && p.end < t0 && p.status !== 'completed';
  if ((budget && spent > budget) || late) health = 'off-track';
  else if (p.status !== 'completed' && (overdue > 0 || budgetUsed >= 90 || elapsed - progress > 20)) health = 'at-risk';

  return { tasks, costs, total: tasks.length, done, progress, overdue, spent, remaining: budget - spent, budgetUsed, elapsed, health };
}

// ---- Sample data (dates relative to today so the timeline is always current) ----

function sample() {
  const s = blank();
  const t0 = today();
  const d = (n) => addDays(t0, n);
  const now = new Date().toISOString();
  const AREA_MANAGERS = ['Grace Mendoza', 'Paolo Villanueva', 'Maria Santos', 'Rafael Ortiz', 'Jose Aquino', 'Liza Ramos'];
  s.settings.regions = REGIONS.map((name, i) => ({ name, manager: AREA_MANAGERS[i] }));

  const P = (code, name, client, manager, status, start, end, budget, description, region) => {
    const p = { id: uid('project'), code, name, client, manager, region, status, start: d(start), end: d(end), budget, description, createdAt: now };
    s.projects.push(p);
    return p.id;
  };
  const T = (projectId, title, assignee, status, priority, start, due, progress = 0, milestone = false) => s.tasks.push({
    id: uid('task'), projectId, title, assignee, status, priority,
    start: start == null ? '' : d(start), due: d(due),
    progress: status === 'done' ? 100 : progress, milestone, notes: '', createdAt: now,
  });
  const C = (projectId, date, category, description, amount) => s.costs.push({ id: uid('cost'), projectId, date: d(date), category, description, amount, createdAt: now });

  const web = P('PRJ-001', 'Website Redesign', 'Marketing', 'Ana Reyes', 'active', -30, 45, 850000, 'New public website with refreshed brand, CMS and online enquiry forms.', 'Metro North');
  T(web, 'Discovery & requirements', 'Ana Reyes', 'done', 'high', -30, -21);
  T(web, 'Wireframes', 'Ben Cruz', 'done', 'medium', -20, -11);
  T(web, 'Visual design', 'Ben Cruz', 'in-progress', 'high', -10, 5, 60);
  T(web, 'Stakeholder sign-off on sitemap', 'Ana Reyes', 'review', 'medium', -4, 2, 90);
  T(web, 'Front-end build', 'Carla Santos', 'in-progress', 'high', -5, 25, 30);
  T(web, 'Content migration', 'Dan Lim', 'todo', 'medium', 0, 20);
  T(web, 'QA & user acceptance testing', 'Ella Tan', 'todo', 'high', 25, 38);
  T(web, 'Launch', 'Ana Reyes', 'todo', 'urgent', null, 45, 0, true);
  C(web, -25, 'subcontract', 'Design agency deposit', 150000);
  C(web, -12, 'materials', 'Stock photography licences', 18000);
  C(web, -5, 'equipment', 'Hosting & CDN (12 months)', 24000);
  C(web, -2, 'labor', 'Front-end contractor (sprint 1)', 95000);

  const wh = P('PRJ-002', 'Warehouse Expansion – Phase 1', 'Operations', 'Dan Lim', 'active', -60, 120, 4500000, 'Add 1,200 m² of racked storage and a second loading bay.', 'North Luzon');
  T(wh, 'Site survey', 'Dan Lim', 'done', 'medium', -60, -50);
  T(wh, 'Building permits', 'Ella Tan', 'review', 'urgent', -50, -5, 80);
  T(wh, 'Racking procurement', 'Carla Santos', 'in-progress', 'high', -30, 20, 50);
  T(wh, 'Civil works', 'Dan Lim', 'in-progress', 'high', -20, 40, 35);
  T(wh, 'Electrical & lighting', 'Ben Cruz', 'todo', 'medium', 35, 70);
  T(wh, 'Racking install & fit-out', 'Carla Santos', 'todo', 'medium', 60, 105);
  T(wh, 'Handover', 'Dan Lim', 'todo', 'high', null, 120, 0, true);
  C(wh, -55, 'subcontract', 'Topographic & soil survey', 120000);
  C(wh, -40, 'other', 'Permit & inspection fees', 85000);
  C(wh, -25, 'materials', 'Racking supplier deposit (50%)', 1400000);
  C(wh, -10, 'subcontract', 'Civil works progress billing #1', 2700000);

  const erp = P('PRJ-003', 'ERP Rollout', 'Finance', 'Ella Tan', 'planning', 14, 150, 1200000, 'Replace spreadsheets with an ERP for purchasing, inventory and accounting.', 'Metro North');
  T(erp, 'Vendor shortlist & demos', 'Ella Tan', 'in-progress', 'high', -7, 10, 40);
  T(erp, 'Data mapping', 'Dan Lim', 'todo', 'medium', 14, 45);
  T(erp, 'Configuration & testing', 'Carla Santos', 'todo', 'medium', 45, 110);
  T(erp, 'Staff training', 'Ana Reyes', 'todo', 'medium', 110, 140);
  T(erp, 'Go-live', 'Ella Tan', 'todo', 'urgent', null, 150, 0, true);
  C(erp, -3, 'other', 'Vendor demo travel', 12000);

  const net = P('PRJ-004', 'Office Network Upgrade', 'IT', 'Ben Cruz', 'completed', -120, -40, 300000, 'Replace switches and Wi-Fi access points on all floors.', 'North Luzon');
  T(net, 'Network audit', 'Ben Cruz', 'done', 'medium', -120, -110);
  T(net, 'Hardware purchase', 'Ben Cruz', 'done', 'high', -105, -80);
  T(net, 'Install & cut-over', 'Carla Santos', 'done', 'high', -75, -40);
  C(net, -95, 'equipment', 'Switches & access points', 248000);
  C(net, -50, 'labor', 'Weekend cut-over crew', 64000);

  const depot = P('PRJ-005', 'Las Piñas Distribution Depot', 'Operations', 'Ben Cruz', 'active', -45, 90, 2800000, 'Fit out a leased depot with racking, office space and a loading dock.', 'Metro South');
  T(depot, 'Lease & site handover', 'Ben Cruz', 'done', 'high', -45, -35);
  T(depot, 'Office partitioning', 'Carla Santos', 'in-progress', 'medium', -20, 15, 55);
  T(depot, 'Loading dock works', 'Dan Lim', 'in-progress', 'high', -10, 40, 20);
  T(depot, 'Racking install', 'Carla Santos', 'todo', 'medium', 40, 80);
  T(depot, 'Depot opening', 'Ben Cruz', 'todo', 'urgent', null, 90, 0, true);
  C(depot, -40, 'other', 'Lease deposit', 450000);
  C(depot, -15, 'subcontract', 'Partitioning contractor (40%)', 380000);

  const cebu = P('PRJ-006', 'Cebu Branch Fit-out', 'Sales', 'Ana Reyes', 'active', -25, 60, 1600000, 'Interior fit-out of the new Cebu sales branch.', 'Visayas');
  T(cebu, 'Design approval', 'Ana Reyes', 'done', 'high', -25, -18);
  T(cebu, 'Ceiling & lighting', 'Ben Cruz', 'in-progress', 'medium', -12, 8, 45);
  T(cebu, 'Furniture delivery', 'Ella Tan', 'todo', 'medium', 20, 40);
  T(cebu, 'Branch handover', 'Ana Reyes', 'todo', 'high', null, 60, 0, true);
  C(cebu, -20, 'subcontract', 'Fit-out contractor mobilisation', 420000);
  C(cebu, -6, 'materials', 'Lighting fixtures', 180000);

  const davao = P('PRJ-007', 'Davao Warehouse Roofing', 'Operations', 'Dan Lim', 'planning', 10, 75, 950000, 'Replace the warehouse roof sheets and gutters before the rainy season.', 'Mindanao');
  T(davao, 'Roof inspection report', 'Dan Lim', 'in-progress', 'high', -5, 9, 50);
  T(davao, 'Contractor bidding', 'Ella Tan', 'todo', 'medium', 10, 30);
  T(davao, 'Roof replacement', 'Dan Lim', 'todo', 'high', 30, 70);
  T(davao, 'Final inspection', 'Dan Lim', 'todo', 'medium', null, 75, 0, true);

  const lag = P('PRJ-008', 'Laguna Plant Safety Upgrade', 'Manufacturing', 'Ella Tan', 'active', -35, 30, 700000, 'Fire suppression, emergency lighting and signage across the plant.', 'South Luzon');
  T(lag, 'Safety audit', 'Ella Tan', 'done', 'high', -35, -28);
  T(lag, 'Fire suppression install', 'Carla Santos', 'in-progress', 'urgent', -20, -2, 70);
  T(lag, 'Emergency lighting', 'Ben Cruz', 'in-progress', 'medium', -10, 12, 40);
  T(lag, 'Fire drill & sign-off', 'Ella Tan', 'todo', 'high', null, 30, 0, true);
  C(lag, -25, 'equipment', 'Sprinkler heads & pumps', 410000);
  C(lag, -8, 'labor', 'Installation crew', 260000);


  return s;
}
