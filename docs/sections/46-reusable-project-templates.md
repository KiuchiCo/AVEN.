# Section 1.46 · Reusable project templates

The Projects page now includes a workspace template library. Save the selected project as a template to capture its description, task titles and descriptions, task priorities, and milestone titles. Template creation copies up to the first 100 tasks and 50 milestones in their existing order.

Choose **Use template**, name the new project, and AVEN creates the project plus its starter tasks and milestones in a single database transaction. New tasks start as open, unassigned tasks with no due dates; milestones also start without dates. Project status starts at Planning. This keeps each new run independent of the original project's completion, assignments, schedule, and budget. Templates can be deleted without affecting projects already created from them.

Templates are scoped to the active workspace. The API verifies membership and write access, and every list, apply, and delete query includes the workspace ID.

## Migration and local setup

Apply the new additive migration and regenerate Prisma Client from the repository root:

```bash
npm run db:migrate:deploy
npm run db:generate
```

Restart the API and web development servers after generation.

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

In Projects, save a project that has tasks and milestones as a template. Launch a new project from it and confirm that the new project has the copied description, open tasks with their priorities, and incomplete milestones. Delete the template and confirm the created project remains.

## Commit and push

```bash
git add README.md docs/sections/46-reusable-project-templates.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118220000_project_templates apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/projects.controller.ts apps/web/app/workspace/projects/page.tsx apps/web/app/globals.css
git commit -m "feat: add reusable project templates"
git push origin main
```
