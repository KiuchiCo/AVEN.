# Section 1.64 · Task duplication

Members can duplicate a task from its detail view. The new task stays in the same project and copies the description, priority, labels, due date, and ordered checklist. It starts in To Do with completion state reset, and is assigned to the member who creates it. The copy and its checklist items are created in one transaction, with activity recorded for the new task. Comments, followers, calendar events, and task dependencies are not copied.

## Verification

- Duplicate a task that has a description, labels, due date, and a checklist with completed and incomplete rows.
- Confirm AVEN opens the new task, with copied details and all checklist items reset to incomplete.
- Confirm the original task and its collaboration records remain unchanged.
- Try duplicating a task ID from another workspace and confirm the API returns not found.
- Confirm a Guest cannot duplicate a task.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/tasks.controller.ts apps/web/app/globals.css apps/web/app/workspace/tasks/'[taskId]'/components/task-detail-view.tsx apps/web/app/workspace/tasks/'[taskId]'/components/task-quick-actions.tsx apps/web/app/workspace/tasks/'[taskId]'/task-detail-page.tsx docs/sections/64-task-duplication.md
git commit -m "feat: duplicate tasks with checklists"
git push origin main
```
