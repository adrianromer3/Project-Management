// localStorage-backed data store. Three collections (projects, tasks, costs) plus settings.
// Every write goes through commit(), which saves and notifies subscribers (the app re-renders).

import { uid, clamp, sum, today, addDays, daysBetween } from './util.js';

const KEY = 'pm:v1:data';
const COLLECTIONS = ['projects', 'tasks', 'costs'];
const DEFAULT_SETTINGS = { currency: 'PHP' };
const listeners = new Set();

let state = load();

function blank() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, projects: [], tasks: [], costs: [] };
}

function normalize(d) {
  const s = blank();
  if (!d || typeof d !== 'object') return s;
  for (const c of COLLECTIONS) s[c] = Array.isArray(d[c]) ? d[c] : [];
  s.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  return s;
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
  state.settings = keep;
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

  const P = (code, name, client, manager, status, start, end, budget, description) => {
    const p = { id: uid('project'), code, name, client, manager, status, start: d(start), end: d(end), budget, description, createdAt: now };
    s.projects.push(p);
    return p.id;
  };
  const T = (projectId, title, assignee, status, priority, start, due, progress = 0, milestone = false) => s.tasks.push({
    id: uid('task'), projectId, title, assignee, status, priority,
    start: start == null ? '' : d(start), due: d(due),
    progress: status === 'done' ? 100 : progress, milestone, notes: '', createdAt: now,
  });
  const C = (projectId, date, category, description, amount) => s.costs.push({ id: uid('cost'), projectId, date: d(date), category, description, amount, createdAt: now });

  const web = P('PRJ-001', 'Website Redesign', 'Marketing', 'Ana Reyes', 'active', -30, 45, 850000, 'New public website with refreshed brand, CMS and online enquiry forms.');
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

  const wh = P('PRJ-002', 'Warehouse Expansion – Phase 1', 'Operations', 'Dan Lim', 'active', -60, 120, 4500000, 'Add 1,200 m² of racked storage and a second loading bay.');
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

  const erp = P('PRJ-003', 'ERP Rollout', 'Finance', 'Ella Tan', 'planning', 14, 150, 1200000, 'Replace spreadsheets with an ERP for purchasing, inventory and accounting.');
  T(erp, 'Vendor shortlist & demos', 'Ella Tan', 'in-progress', 'high', -7, 10, 40);
  T(erp, 'Data mapping', 'Dan Lim', 'todo', 'medium', 14, 45);
  T(erp, 'Configuration & testing', 'Carla Santos', 'todo', 'medium', 45, 110);
  T(erp, 'Staff training', 'Ana Reyes', 'todo', 'medium', 110, 140);
  T(erp, 'Go-live', 'Ella Tan', 'todo', 'urgent', null, 150, 0, true);
  C(erp, -3, 'other', 'Vendor demo travel', 12000);

  const net = P('PRJ-004', 'Office Network Upgrade', 'IT', 'Ben Cruz', 'completed', -120, -40, 300000, 'Replace switches and Wi-Fi access points on all floors.');
  T(net, 'Network audit', 'Ben Cruz', 'done', 'medium', -120, -110);
  T(net, 'Hardware purchase', 'Ben Cruz', 'done', 'high', -105, -80);
  T(net, 'Install & cut-over', 'Carla Santos', 'done', 'high', -75, -40);
  C(net, -95, 'equipment', 'Switches & access points', 248000);
  C(net, -50, 'labor', 'Weekend cut-over crew', 64000);

  return s;
}
