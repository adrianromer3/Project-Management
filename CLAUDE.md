# CLAUDE.md

Client-side project management app. Plain HTML + Tailwind CDN + vanilla ES modules + Chart.js 4 (CDN). No build step, no npm, no server.

## Run

`python3 -m http.server 5173`, then open http://localhost:5173 (ES modules need HTTP, not file://).

## Architecture

- `js/store.js` is the only module that touches `localStorage` (key `pm:v1:data`). All writes go through `insert/update/remove/setSettings`, which call `commit()`. `commit()` saves and notifies subscribers, and `app.js` re-renders the current route on every commit. Pages never re-render themselves after a write.
- Collections: `projects`, `tasks` (`projectId`), `costs` (`projectId`). Deleting a project cascades to its tasks and costs.
- Derived numbers (progress, health, spent, overdue) come from `store.projectStats(p)` and are never stored.
- Each page module exports `render(main, ...)`, which returns the page title.
- Routes: `#/dashboard`, `#/projects`, `#/projects/:id/(board|list|timeline|budget)`, `#/settings`.
- Dates are ISO `YYYY-MM-DD` strings in local time. Use the helpers in `js/util.js`.
- Always pass user text through `esc()` before putting it in HTML.
- Forms use `formModal({ title, fields, validate, deletable })` from `js/ui.js`.
- Charts must be created with `chart()` from `ui.js` so they are destroyed on navigation.
- Shared component classes (`.input`, `.btn`, `.card`) live in plain CSS in `css/custom.css`, because the Tailwind CDN doesn't process `@apply` in linked files.
