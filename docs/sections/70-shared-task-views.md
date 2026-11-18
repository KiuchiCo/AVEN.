# Section 1.70 · Shared task views

Saved task views now live in PostgreSQL and are shared by every member of a workspace across browsers and devices. Members can create, rename, update filters, apply, and delete views. Names are checked for duplicates without case sensitivity. A workspace can have up to 20 views. The API validates filter values and ensures project and assignee references belong to the same workspace. Existing browser-local views are imported on the first reload after the migration; if the workspace is full, the original browser copies are preserved until a slot is available.

This section adds the `WorkspaceTaskView` model and the `20261119040000_workspace_task_views` migration. Apply it locally before starting AVEN with the updated code:

```sh
npm run db:up
npm run db:migrate:dev
npm run db:generate
npm run typecheck
```

The migration is already named `workspace_task_views`; Prisma should not ask you to enter a migration name.

## Verification

- Create a view and confirm it appears after signing in from another browser or workspace member account.
- Update its name and filters, then apply it and verify the board matches.
- Confirm duplicate names are rejected regardless of capitalization.
- Delete a view and confirm it disappears for all members.
- Confirm a Guest can read and apply views but cannot create, update, or delete them.
- Confirm project and assignee filters from another workspace are rejected.
- Confirm old browser-local views import once, with their filters intact; verify the original local copy stays if no shared slots remain.
- Confirm all operations reject view IDs outside the current workspace.

Suggested commit after applying the migration and checking the UI:

```sh
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261119040000_workspace_task_views/migration.sql apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/tasks.controller.ts apps/web/app/workspace/projects/page.tsx docs/sections/70-shared-task-views.md
git commit -m "feat: share saved task views across workspace"
git push origin main
```
