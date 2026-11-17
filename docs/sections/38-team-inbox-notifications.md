# Section 1.38 · Team updates in the Inbox

## Goal

Bring teammate activity into the Inbox as actionable notifications, separate from the existing deadline and task-priority queue.

## Delivered

- Added per-user read and dismissal receipts for workspace activity, keeping shared activity history intact.
- Added authenticated workspace-scoped endpoints to list teammate updates, mark one read or unread, dismiss one, and mark all as read.
- Excluded the current user's own actions from their notification list; the shared Activity page still shows the full workspace history.
- Added a team updates panel to Inbox with unread count, links to the affected module, mark-read/unread, dismiss, and mark-all-read actions.
- Added the `activity_receipts` table with cascading foreign keys and indexes for member-specific status lookups.

## Database migration

Migration is named `20261118160000_activity_read_receipts`. From the repository root:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

The SQL migration is already included, so `migrate:deploy` applies it without asking for a migration name.

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
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118160000_activity_read_receipts/migration.sql apps/api/src/productivity/activity.controller.ts apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/workspace-productivity.tsx docs/sections/38-team-inbox-notifications.md
git commit -m "feat: add per-member workspace notifications"
git push origin main
```
