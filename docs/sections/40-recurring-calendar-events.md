# Section 1.40 · Recurring calendar events

## Goal

Schedule repeat events in AVEN Calendar while preserving the event's local wall-clock time across daylight-saving changes.

## Delivered

- Added daily, weekly, and monthly recurrence, configurable interval, end date, and IANA timezone to calendar event series.
- Added API validation for recurrence frequency, interval, timezone, and the required end date; series are limited to two years.
- Expanded event occurrences in Month and 90-day Agenda views and in AVEN Intelligence's weekly briefing.
- Added series editing and deletion. The UI confirms deletion of an entire series and labels edits that affect every occurrence.
- Preserved the original series timezone when a teammate edits an existing series from another timezone.
- Added `CalendarRecurrence` and recurrence columns to `calendar_events`.

## Database migration

Migration is named `20261118180000_calendar_recurring_events`. From the repository root:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

The SQL migration is included, so `migrate:deploy` applies it without asking for a migration name.

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

## Commit and push

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118180000_calendar_recurring_events/migration.sql apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/intelligence.service.ts apps/web/app/workspace/connected-records.tsx apps/web/app/globals.css docs/sections/40-recurring-calendar-events.md
git commit -m "feat: add recurring calendar events"
git push origin main
```
