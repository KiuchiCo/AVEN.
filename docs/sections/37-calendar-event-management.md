# Section 1.37 · Calendar event management

## Goal

Make scheduled calendar events manageable after creation, with workspace-scoped updates and removals, event/deadline filters, and clear edit state.

## Delivered

- Added authenticated event update and delete API routes scoped to the requested workspace.
- Validated changed event titles, task links, dates, and end-after-start ordering on the API.
- Recorded calendar edits and removals in workspace activity.
- Added edit and delete actions to calendar agenda and selected-day views, with an explicit confirmation before deletion.
- Added independent filters for scheduled events and task deadlines in both calendar views.
- Clarified that event inputs use local timezone and added a cancel-edit flow.
- No schema changes or migration are needed.

## Verification

From the repository root:

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

## Commit and push

```bash
git add apps/api/src/productivity/calendar.controller.ts apps/api/src/productivity/productivity.service.ts apps/web/app/workspace/connected-records.tsx apps/web/app/globals.css docs/sections/37-calendar-event-management.md README.md
git commit -m "feat: manage calendar events and filters"
git push origin main
```
