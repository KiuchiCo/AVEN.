# Section 1.65 · Bulk task duplication

The project task board can now duplicate selected tasks as a batch, up to 100 at a time. Each copy retains its original project, description, priority, labels, due date, and ordered checklist, while resetting task and checklist completion. The API validates workspace membership and every selected task, creates all copies and their checklist rows in one transaction, and records activity for each new task. A failure rolls back the whole batch.

## Verification

- Select tasks from one or more projects, including tasks with and without checklists, and use Duplicate with checklists.
- Confirm one new To Do task appears for each selection, with checklist items incomplete and the source details preserved.
- Confirm the selection clears, the task board reloads, and the notice reports task and checklist counts.
- Select more than 100 tasks and confirm the bulk duplicate control is disabled with a clear limit message.
- Submit a request containing a task ID outside the workspace and confirm no copies are created.
- Confirm a Guest cannot duplicate tasks.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/tasks.controller.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/65-bulk-task-duplication.md
git commit -m "feat: duplicate selected tasks in bulk"
git push origin main
```
