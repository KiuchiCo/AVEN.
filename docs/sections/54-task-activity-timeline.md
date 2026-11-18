# Section 1.54 · Task activity timeline

The Task Activity tab now reads the workspace activity records for the selected task. It shows task edits and assignments alongside comments, checklist changes, dependency updates, and batch changes recorded against that task. Each entry includes the actor and timestamp, and the API limits the response to the 100 most recent matching entries.

The activity endpoint checks workspace membership and verifies task access before querying. The Activity tab keeps shared task history visible to workspace members; Inbox visibility remains controlled separately by recipient-scoped notification receipts.

## Database

No schema migration is required. This uses existing workspace activity records.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

Open a task and switch to **Activity**. Create and edit a comment, complete a checklist item, change the task status or assignee, and update prerequisites. Confirm that each action appears once with the correct actor and time. Confirm that a task from another workspace cannot be loaded through the activity endpoint.

## Commit and push

```bash
git add README.md apps/api/src/productivity/task-collaboration/task-collaboration.controller.ts apps/api/src/productivity/task-collaboration/task-detail.service.ts apps/web/app/workspace/tasks/'[taskId]' docs/sections/54-task-activity-timeline.md
git commit -m "feat: show task activity timeline"
git push origin main
```
