# Project Management

An application that helps management track every project end to end: tasks, timeline, budget and overall health.

Plain HTML, Tailwind CSS (CDN), vanilla JavaScript ES modules and Chart.js. **No server code, no database, no build step.** Data is stored in the browser's `localStorage` and can be exported/imported as JSON.

## Features

- **Dashboard**: active projects, open and overdue tasks, project progress, a highlighted budget row (total budget, actual spent, budget utilization), budget vs actual chart, task status mix, a Gantt chart with one row per on-going project, a project health table with project managers, and lists of overdue and upcoming tasks.
- **Gantt chart (all)**: every on-going project with its tasks on one timeline. Opened from the sidebar under On-going Projects.
- **Projects**: searchable, filterable cards with health, progress, task counts and budget used.
- **Project detail**, with four views:
  - **Board**: Kanban (To do → In progress → Review → Done) with drag and drop.
  - **List**: sortable task table with inline status changes.
  - **Timeline**: Gantt chart with month grid, progress fill, milestones (◆), overdue highlighting and a today line.
  - **Budget**: budget, spent, remaining and variance, spend by category, and cost entries.
- **Settings**: currency, JSON backup export/import, load sample data, clear all.
- Dark mode, responsive layout with a mobile drawer.

### Project health

| Health | Rule |
| --- | --- |
| Off track | Spent more than budget, or past the end date and not completed |
| At risk | Has overdue tasks, ≥ 90% of budget spent, or schedule elapsed is more than 20 points ahead of completion |
| On track | Everything else |

Progress is the average of task progress (done tasks count as 100%).

## Run locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 5173
```

Then open <http://localhost:5173>. The first visit loads sample projects. Use **Settings → Clear all data** to start empty.

## Deploy

Upload the folder to any static host (GitHub Pages, Netlify, S3 and so on). There is nothing to build.

## Structure

```
index.html          App shell (sidebar, header, modal + toast roots)
css/custom.css      Shared component classes (.input, .btn, .card)
js/app.js           Hash router, nav, theme, drawer
js/store.js         localStorage data store, CRUD, import/export, metrics, sample data
js/ui.js            Labels/colours, formatters, HTML builders, modals, toasts, charts
js/util.js          Escaping, dates, ids
js/gantt.js         Shared Gantt renderer (project timeline, dashboard, Gantt page)
js/pages/           dashboard, projects, project (board/list/timeline/budget), gantt, settings
```
