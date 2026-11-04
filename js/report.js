// Status report for one project: live numbers plus the written notes saved on project.report.
// The Report tab and every export render this one object, so they can't disagree.

import * as store from './store.js';
import { sum, today, addDays, daysBetween, byDue } from './util.js';
import { PROJECT_STATUS, TASK_STATUS, PRIORITY, HEALTH, COST_CATEGORY } from './ui.js';

// Notes are typed one item per line; pasted bullet markers are dropped.
const lines = (text) => String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*[•*-]\s*/, '').trim()).filter(Boolean);

function taskRow(t) {
  return {
    title: t.title,
    assignee: t.assignee || '',
    status: TASK_STATUS[t.status]?.label || t.status,
    priority: PRIORITY[t.priority]?.label || t.priority,
    start: t.start || '',
    due: t.due || '',
    progress: t.status === 'done' ? 100 : Number(t.progress) || 0,
    milestone: !!t.milestone,
  };
}

export function buildReport(p) {
  const s = store.projectStats(p);
  const t0 = today();
  const soon = addDays(t0, 14);
  const sorted = [...s.tasks].sort(byDue);
  const open = sorted.filter((t) => t.status !== 'done');
  const notes = p.report || {};

  return {
    asOf: t0,
    code: p.code,
    name: p.name,
    client: p.client || '',
    manager: p.manager || '',
    region: p.region || '',
    areaManager: store.regionOf(p)?.manager || '',
    description: p.description || '',
    start: p.start || '',
    end: p.end || '',
    status: PROJECT_STATUS[p.status]?.label || p.status,
    health: HEALTH[s.health].label,
    healthColor: HEALTH[s.health].color,
    progress: s.progress,
    elapsed: s.elapsed,
    done: s.done,
    total: s.total,
    overdueCount: s.overdue,
    budget: Number(p.budget) || 0,
    spent: s.spent,
    remaining: s.remaining,
    budgetUsed: s.budgetUsed,
    daysLeft: p.end ? Math.max(0, daysBetween(t0, p.end)) : null,
    summary: String(notes.summary || '').trim(),
    accomplishments: lines(notes.accomplishments),
    nextSteps: lines(notes.nextSteps),
    risks: lines(notes.risks),
    milestones: sorted.filter((t) => t.milestone).map(taskRow),
    overdue: open.filter((t) => t.due && t.due < t0).map(taskRow),
    upcoming: open.filter((t) => t.due && t.due >= t0 && t.due <= soon).map(taskRow),
    tasks: sorted.map(taskRow),
    costs: [...s.costs].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((c) => ({
      date: c.date || '',
      category: COST_CATEGORY[c.category]?.label || c.category,
      description: c.description || '',
      amount: Number(c.amount) || 0,
    })),
    byCategory: Object.entries(COST_CATEGORY)
      .map(([k, m]) => ({ label: m.label, amount: sum(s.costs.filter((c) => c.category === k), (c) => c.amount) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount),
  };
}
