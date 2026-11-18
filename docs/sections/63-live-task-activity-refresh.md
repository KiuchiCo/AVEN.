# Section 1.63 · Live task activity refresh

Task activity now refreshes immediately after a comment or checklist action succeeds in the same browser tab. It also reloads when the tab becomes visible again, allowing changes made elsewhere to appear when the user returns. Refreshes are scoped to the task currently open, and event listeners are removed when the task view unmounts.

## Verification

- Keep a task open and add, edit, or delete a comment; confirm the activity list updates without reloading the page.
- Complete, rename, reorder, or remove a checklist item and confirm activity refreshes.
- Change task tabs or open another task and confirm old views do not trigger additional refreshes.
- Make a change in another browser session, return to the original tab, and confirm it refreshes when visible.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/web/app/workspace/tasks/'[taskId]'/hooks/use-task-activity.ts apps/web/app/workspace/tasks/'[taskId]'/hooks/use-task-comments.ts apps/web/app/workspace/tasks/'[taskId]'/hooks/use-task-checklist.ts apps/web/app/workspace/tasks/'[taskId]'/lib/task-activity-events.ts docs/sections/63-live-task-activity-refresh.md
git commit -m "feat: refresh task activity after collaboration"
git push origin main
```
