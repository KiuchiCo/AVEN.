# Section 1.68 · Bulk task labels

Bulk task planning now supports label actions across the current selection: add labels while preserving existing labels, remove only the named labels, or replace the full label set. Replacement with an empty field clears every selected task's labels. Labels are normalized to lowercase and validated against the same character and length rules used by single-task editing. If adding labels would push any task beyond its 10-label limit, the whole transaction is rejected, so the selection is never left partially changed. Changed tasks continue to receive individual activity entries and follower notifications.

## Verification

- Add labels to several tasks and confirm each keeps its previous labels.
- Remove one or more labels and confirm unrelated labels remain.
- Replace all labels, then replace with an empty field to clear them.
- Check duplicate labels are normalized and deduplicated.
- Attempt to exceed a task's 10-label limit and confirm the full selection stays unchanged.
- Confirm no-op label actions report zero updated tasks and do not add activity entries.
- Confirm bulk status, priority, assignee, due-date, and duplication actions still work.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/68-bulk-task-labels.md
git commit -m "feat: add bulk task label actions"
git push origin main
```
