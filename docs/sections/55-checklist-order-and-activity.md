# Section 1.55 · Checklist ordering and activity

Checklist rows can now be moved up or down from the task detail panel. The API records checklist renames, removals, and reordering in the task activity timeline, alongside the existing add and completion events. Completion updates are recorded only when the state actually changes, so repeating the same request does not create duplicate activity.

## Verification

- Open a task with at least two checklist items and move an item up or down.
- Rename and remove checklist items, then complete or reopen an item.
- Confirm these changes appear in the task activity timeline and that the first/last row move controls disable at the list boundaries.
- Confirm a guest can view the checklist but cannot change it.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/task-collaboration/task-checklist.service.ts apps/web/app/workspace/tasks/'[taskId]' apps/web/app/globals.css docs/sections/55-checklist-order-and-activity.md
git commit -m "feat: add checklist ordering and activity"
git push origin main
```
