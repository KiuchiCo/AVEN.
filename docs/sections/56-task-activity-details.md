# Section 1.56 · Task activity details

Task collaboration activity now identifies checklist items by a short title and includes a short comment preview. Checklist activity distinguishes moving an item up from moving it down. Activity messages are whitespace-normalized and capped to the database's 240-character limit before insertion, so long task titles and comment bodies cannot overflow the column.

## Verification

- Add, rename, complete, reopen, remove, and move checklist items; confirm the activity text names the item and states the action.
- Add, edit, and delete a comment; confirm the activity includes a compact preview.
- Use long task titles and comments and confirm the operations still complete without a database length error.
- Confirm activity entries remain visible to task followers and mentioned teammates as before.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/task-collaboration/task-collaboration.notifications.ts apps/api/src/productivity/task-collaboration/task-checklist.service.ts apps/api/src/productivity/task-collaboration/task-comments.service.ts docs/sections/56-task-activity-details.md
git commit -m "feat: add details to task activity"
git push origin main
```
