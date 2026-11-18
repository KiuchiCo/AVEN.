# Section 1.53 · Task assignment notifications

Members assigned to tasks receive targeted Inbox updates. An assignee is notified when an assigned task is created. When ownership changes, the previous and new assignees are notified; clearing an assignment notifies the previous assignee. The task editor receives no notification for their own change. Existing task followers continue to receive task update notifications.

Batch assignment changes notify only the assignees whose assignment actually changed, plus followers of the selected tasks. A single batch activity entry is used, and each recipient gets at most one receipt even if they were assigned to multiple selected tasks.

The activity remains visible in the shared Activity page. Recipient-scoped filtering applies only to Inbox visibility.

## Database

No schema migration is required. The existing recipient-scoped workspace activity and per-user receipts are used.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

Use three workspace members. Create a task assigned to one member and confirm that member receives an Inbox update. Reassign it and confirm both the prior and new assignees receive an update, while an unrelated member and the editing actor do not. Clear the assignment and confirm only the prior assignee receives the assignment update. Repeat with a batch containing multiple tasks, including a task whose assignee is already the selected new assignee; unchanged assignees should not receive assignment alerts.

## Commit and push

```bash
git add README.md apps/api/src/productivity/productivity.service.ts docs/sections/51-task-follower-updates.md docs/sections/53-task-assignment-notifications.md
git commit -m "feat: notify members about task assignments"
git push origin main
```
