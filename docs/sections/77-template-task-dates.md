# Section 1.77 · Task due dates in project templates

Project templates now preserve task due dates as day offsets from the date the template is saved. Applying the template recreates those due dates relative to the new project's creation day, alongside the milestone schedule. Tasks without due dates remain undated; new tasks always start in To do with no assignee or completion timestamp.

The template editor supports changing or clearing a task's due offset. Offsets use the same ten-year limit as milestone timing. Older templates without task date offsets continue to create undated tasks.

No database migration is required.

## Verification

- Save a project with dated and undated tasks; verify the relative offsets appear in its template editor.
- Change, clear, and add task due offsets; save and apply the template.
- Confirm due dates shift relative to the new project creation day and preserve the spacing between tasks and milestones.
- Confirm tasks start in To do, remain unassigned, and preserve dependencies, descriptions, priorities, and labels.
- Verify invalid or out-of-range offsets are rejected and older templates remain usable.

Suggested commit after reviewing Section 1.77:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/77-template-task-dates.md
git commit -m "feat: preserve task dates in project templates"
git push origin main
```
