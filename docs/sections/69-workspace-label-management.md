# Section 1.69 · Workspace label management

The task board now includes a workspace label manager with usage counts. Members can rename a label everywhere or merge it into an existing label. They can also remove a label from every task in the workspace. Each affected task gets an activity record and its followers are notified. Updates run in a transaction and detect tasks that changed concurrently; on conflict, the complete operation is rolled back. The UI updates the current label filter and saved browser-local views when a label is renamed or removed.

## Verification

- Open Workspace labels and confirm each label's count matches the task cards.
- Rename a label and confirm it changes across tasks, filters, and saved views.
- Rename a label to an existing label and confirm duplicates merge without duplicate tags.
- Remove a label and confirm it disappears from all task cards and filters.
- Confirm affected task followers receive activity notifications.
- Confirm Guests cannot manage labels and that workspace records remain scoped to the selected workspace.
- Verify concurrent label edits return a clear retry message without partially applying a rename or removal.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/tasks.controller.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/69-workspace-label-management.md
git commit -m "feat: add workspace task label management"
git push origin main
```
