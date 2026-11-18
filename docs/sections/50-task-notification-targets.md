# Section 1.50 · Task collaboration notification targets

Task comment and checklist updates are now visible in a member's Inbox only when that member follows the task or was mentioned in the comment. The shared Activity page continues to show workspace activity to workspace members. This separates the workspace-wide history from per-member notifications.

`activity_receipts.isNotificationTarget` records why a collaboration update is eligible for an Inbox. Read, unread, dismiss, and mark-all-read actions do not grant notification access. Existing receipts default to `false`, so old activity does not become newly visible as targeted collaboration notifications.

## Database migration

Migration `20261119020000_task_notification_targets` adds the target flag and a lookup index. From the repository root:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Use two workspace members. Have one follow a task and mention the other in a comment: both should receive the update in Inbox. A third member who neither follows nor is mentioned should not see it in Inbox. All three should still see the shared activity entry on the Activity page. Mark all updates read as the third member and confirm this does not reveal the targeted notification.

## Commit and push

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261119020000_task_notification_targets/migration.sql apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/task-collaboration/task-collaboration.notifications.ts docs/sections/49-task-collaboration.md docs/sections/50-task-notification-targets.md

git commit -m "fix: scope task collaboration notifications"
git push origin main
```
