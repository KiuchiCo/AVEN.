# Section 1.41 · Calendar planning and workspace search

## Delivered tasks

This slice expands calendar planning and makes two more workspace information types discoverable through global search.

1. Added dedicated Day, Week, Month, and Agenda calendar views.
2. Added day navigation in daily increments and week navigation in seven-day increments.
3. Added active-range labels for the selected date and week.
4. Added a 24-hour day timeline with hourly rows.
5. Added one-click scheduling from an hourly row.
6. Added Monday-first week columns with the current day highlighted.
7. Added selectable event categories: Meeting, Focus, Personal, Reminder, and Other.
8. Added category-specific colors in week and day views.
9. Added event-category filters alongside existing event/deadline filters.
10. Added all-day event support and all-day display in calendar views.
11. Added optional project links on scheduled events, scoped to the active workspace.
12. Added optional event location and surfaced it in the schedule.
13. Added optional event notes and included them in workspace search.
14. Added iCalendar (.ics) export for the currently visible range and selected filters.
15. Added scheduled events to global search and exposed Knowledge and Event result filters.

## Migration

From the repository root, apply the checked-in migration and regenerate Prisma Client:

```bash
npm run db:migrate:deploy
npm run db:generate
```

The checked-in migration is `20261118190000_calendar_planning_features`; no migration name prompt is needed.

## Verification

```bash
npm run typecheck
npm run db:validate
npm run build
git diff --check
```

## Suggested commit

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118190000_calendar_planning_features apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/connected-records.tsx apps/web/app/workspace/search/page.tsx docs/sections/41-calendar-planning-search.md
git commit -m "feat: expand calendar planning and workspace search"
git push origin main
```
