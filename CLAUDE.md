# CLAUDE.md

Client-side project management app. Plain HTML + Tailwind CDN + vanilla ES modules + Chart.js 4 (CDN). No build step, no npm, no server.

## Run

`python3 -m http.server 5173`, then open http://localhost:5173 (ES modules need HTTP, not file://).

## Architecture

- `js/store.js` is the only module that touches `localStorage` (key `pm:v1:data`). All writes go through `insert/update/remove/setSettings`, which call `commit()`. `commit()` saves and notifies subscribers, and `app.js` re-renders the current route on every commit. Pages never re-render themselves after a write.
- Collections: `projects`, `tasks` (`projectId`), `costs` (`projectId`). Deleting a project cascades to its tasks and costs.
- Derived numbers (progress, health, spent, overdue) come from `store.projectStats(p)` and are never stored.
- Each page module exports `render(main, ...)`, which returns the page title.
- Routes: `#/dashboard`, `#/projects`, `#/projects/:id/(board|list|timeline|budget)`, `#/gantt`, `#/settings`.
- Viewing hierarchy: `settings.regions` holds `{ name, manager }` (the manager is the region's Area Manager; defaults in `store.REGIONS`); each project has a `region`. `settings.viewAs` is `{ role: 'head' }`, `{ role: 'area', region }` or `{ role: 'pm', manager }`. The dashboard breaks each level down one level lower: Head Office by region, Area Manager by project manager, Project Manager by project. Pages list projects with `store.visibleProjects()` (never `all('projects')`), and scope tasks to those project ids.
- Saved data is versioned (`VERSION` in `store.js`); `normalize()` upgrades older saves and imported backups (v1 used `areas`/`area`).

- "On-going" means `status !== 'completed'`. All Gantt charts go through `gantt(rows)` in `js/gantt.js`.
- Dates are ISO `YYYY-MM-DD` strings in local time. Use the helpers in `js/util.js`.
- Always pass user text through `esc()` before putting it in HTML.
- Forms use `formModal({ title, fields, validate, deletable })` from `js/ui.js`.
- Charts must be created with `chart()` from `ui.js` so they are destroyed on navigation.
- Shared component classes (`.input`, `.btn`, `.card`) live in plain CSS in `css/custom.css`, because the Tailwind CDN doesn't process `@apply` in linked files.
