# Section 1.72 · Task dependencies in task details

Task detail pages now show both sides of a task's dependency relationships: prerequisites that block the task and tasks that this task blocks. Each linked task opens its own detail page. In a project task's detail page, **Manage prerequisites** searches tasks in the same project and saves the selected prerequisites.

The API continues to validate that dependencies stay within the project, reject self-dependencies and cycles, and prevent adding prerequisites to completed tasks. Completing a task with unfinished prerequisites remains blocked. No database migration is required.

## Verification

- Open a task in a project and confirm its prerequisites and tasks it blocks are listed with status.
- Add, remove, and search prerequisites from the task detail page; reload and confirm the selection persists.
- Confirm links open the related task.
- Verify a task cannot depend on itself, on another project, or through a dependency cycle.
- Confirm completing a task with an unfinished prerequisite is rejected; complete the prerequisite and retry.
- Confirm completed tasks cannot be assigned new prerequisites until reopened.

Suggested commit after reviewing the changes:

```sh
git add README.md apps/api/src/productivity/task-collaboration/task-detail.service.ts apps/web/app/globals.css 'apps/web/app/workspace/tasks/[taskId]/types.ts' 'apps/web/app/workspace/tasks/[taskId]/task-detail-page.tsx' 'apps/web/app/workspace/tasks/[taskId]/components/task-detail-view.tsx' 'apps/web/app/workspace/tasks/[taskId]/components/task-dependencies-panel.tsx' docs/sections/72-task-dependencies-detail.md
git commit -m "feat: manage task dependencies from task details"
git push origin main
```
