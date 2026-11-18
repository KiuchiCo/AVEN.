# Section 1.48 · Task batch actions and CSV

The Projects task board supports selecting tasks and applying one priority and/or assignee change to a batch of up to 500. An assignee can be kept, changed, or cleared. The API validates every task and assignee against the active workspace, applies the changes transactionally, and writes one activity entry for the batch.

The board can export the current project/priority view as a UTF-8 CSV file with `title`, `description`, `status`, `priority`, and `dueAt` columns. CSV import validates and previews the file before creating any tasks. Imports are limited to 200 tasks and 1 MB; users choose the current project or the workspace as the destination. Titles are required, descriptions are capped at 5,000 characters, and status, priority, and dates are validated on the client and API. Invalid imports are rejected as a whole. Formula-like exported text cells are escaped for spreadsheet safety and AVEN's importer restores that escape when re-importing AVEN exports.

Batch operations intentionally leave task status transitions to the existing per-task flow, which enforces dependencies and runs status automations. Imported tasks can preserve a status from the CSV because they are newly created records, not transitions.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

In Projects, select several tasks and change their priority or assignee. Export the current view, import that CSV into a project, and confirm the preview and imported count. Also try a CSV with an invalid priority and confirm the import is rejected without partially creating tasks.

## Commit and push

```bash
git add README.md docs/sections/48-task-batch-csv.md apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/tasks.controller.ts apps/web/app/workspace/projects/page.tsx apps/web/app/globals.css
git commit -m "feat: add task batch actions and CSV transfer"
git push origin main
```
