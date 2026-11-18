# Section 1.66 · Bulk task planning

Bulk task actions now include setting status and due dates in addition to priority and assignee. A due date can be kept, replaced, or cleared. Status changes create per-task activity and notify each task's followers and relevant assignees. Status automations run after the batch update commits. Moving tasks to Completed checks their prerequisites and rejects the whole batch if any selected task is blocked. Existing atomic bulk duplication remains available alongside these updates.

## Verification

- Select several tasks and set status, priority, assignee, and a due date together.
- Change the due date mode to Clear date and confirm it clears on all selected tasks; choose Keep current and confirm it leaves existing dates untouched.
- Complete a batch with no outstanding prerequisites and confirm each task status and automation outcome.
- Try completing a batch containing a task with an incomplete prerequisite; confirm the entire batch is rejected with no partial updates.
- Confirm followers receive per-task activity notifications and the success notice reports the number of changed tasks.
- Confirm Guests cannot perform bulk changes.

No database migration is required.

Suggested commit:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/66-bulk-task-planning.md
git commit -m "feat: add bulk task planning actions"
git push origin main
```
