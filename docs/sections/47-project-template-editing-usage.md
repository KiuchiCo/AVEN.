# Section 1.47 · Project template editing and usage

Project templates can now be edited in the Projects template library. Update the template name and project description, add or remove starter tasks, adjust task descriptions and priorities, and add or remove milestone titles. The same limits used by template creation are shown in the editor: 100 tasks and 50 milestones.

Each successful template launch increments its usage count and records the most recent use time in the same transaction that creates the new project, tasks, and milestones. If project creation fails, usage tracking rolls back with it. The library shows both the count and last-used date. Existing projects are independent of later template edits.

## Migration and local setup

Apply the additive usage-tracking migration and regenerate Prisma Client from the repository root:

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

In Projects, edit a template and save changes. Use it to launch a project, then confirm its displayed usage count and last-used date update. Open the created project and confirm its content remains unchanged after editing the template again.

## Commit and push

```bash
git add README.md docs/sections/47-project-template-editing-usage.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118233000_project_template_management apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/projects.controller.ts apps/web/app/workspace/projects/page.tsx apps/web/app/globals.css
git commit -m "feat: manage project templates and track usage"
git push origin main
```
