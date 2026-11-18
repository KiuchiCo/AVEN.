# Section 1.49 · Task collaboration

Task detail pages now keep the work and its discussion together. Workspace members can add, edit, and remove their own comments, mention teammates, build ordered checklists, mark steps complete, and follow a task for updates. The task page summarizes the task, checklist progress, discussion, followers, and recent collaboration activity.

Task collaboration endpoints require workspace membership and scope every lookup to the active workspace and task. Guest members can read collaboration details but cannot change comments, checklist items, or follower state. Mentioned users must be members of the same workspace, comments are limited to 2,000 characters, and each task can have up to 100 checklist items.

Task detail links are available from My Tasks, project boards and timelines, global search, calendar deadlines, activity, automation history, Knowledge connections, and AVEN Intelligence.

## Database migration

Migration `20261119010000_task_collaboration` adds task comments, checklist items, and task followers. From the repository root:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Open a task from a project board. Add a checklist item, mark it complete, post a comment, mention a workspace member, and follow the task. Confirm an unrelated task and a different workspace remain inaccessible.

## Commit and push

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261119010000_task_collaboration/migration.sql apps/api/src/productivity/productivity.module.ts apps/api/src/productivity/task-collaboration apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace docs/sections/49-task-collaboration.md
git commit -m "feat: add task collaboration workspace"
git push origin main
```
