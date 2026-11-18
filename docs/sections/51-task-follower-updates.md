# Section 1.51 · Task follower updates

Task followers now receive targeted Inbox updates when someone changes the task, changes its prerequisites, or applies a batch update that includes it. Comments, mentions, and checklist updates continue to notify task followers and mentioned members. The update is stored once in shared workspace activity; recipient receipts control which members see it in Inbox.

Task creation without an assignee remains a workspace-wide Inbox activity. Editing a task sends an Inbox notification to its followers, and the actor does not receive their own update. Batch changes send one notification to the distinct followers of all selected tasks. Section 1.53 adds assignment-specific notifications for previous and new assignees.

## Database migration

Migration `20261119030000_task_follower_updates` adds a recipient-scope flag to workspace activity. From the repository root:

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

Use two workspace members. Have one follow a task, then change the task title, priority, due date, assignee, and prerequisite list as the other member. The follower should receive one Inbox update per change, with a link to the task. An unrelated member should not receive those updates. Try a batch update that includes followed and unfollowed tasks; each follower should get one update for that batch.

## Commit and push

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261119030000_task_follower_updates/migration.sql apps/api/src/productivity/productivity.service.ts apps/web/app/workspace/tasks docs/sections/51-task-follower-updates.md
git commit -m "feat: notify followers about task changes"
git push origin main
```
