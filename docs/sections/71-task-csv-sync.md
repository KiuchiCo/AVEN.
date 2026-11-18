# Section 1.71 · Task CSV sync

Task exports now include the task ID, project ID, and assignee ID alongside the editable task fields. This lets an edited AVEN export be imported back without creating duplicates.

The task import panel offers two modes:

- **Create new tasks** is the default and creates a copy of every row. IDs in the file are ignored.
- **Update matching task IDs and create new rows** updates rows whose task IDs belong to the current workspace. Rows with blank IDs create new tasks. Use the full AVEN export columns when updating existing tasks so blank cells can deliberately clear descriptions, dates, project assignments, or assignees.

Imports accept up to 200 tasks. AVEN validates IDs, project and assignee membership, labels, dates, and task fields before writing. Duplicate IDs, task IDs outside the current workspace, and references outside the workspace are rejected. Updates and their activity records are saved atomically; status automations run after the database transaction succeeds. A no-change row is counted as unchanged and does not generate activity.

No database migration is required for this section.

## Verification

- Export tasks and inspect that the CSV contains `id`, `projectId`, and `assigneeId` columns.
- Import that export in create mode and confirm every row becomes a separate task.
- Change a title, status, label, due date, project, and assignee in an export; import in update mode and confirm the existing tasks change without duplicates.
- Blank a due date, description, project, or assignee in the export and verify the update clears the corresponding value.
- Add a row with a blank ID in update mode and verify that it creates a task.
- Import the same unchanged export again and verify rows are reported unchanged.
- Verify invalid, duplicate, and out-of-workspace IDs and project or assignee references are rejected without partial writes.
- Confirm dependency rules and status automations still apply to imported status changes.

Suggested commit after reviewing the changes:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/workspace/projects/page.tsx docs/sections/71-task-csv-sync.md
git commit -m "feat: sync task CSV exports and imports"
git push origin main
```
