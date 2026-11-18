# Section 1.43 · Task status automations

## Delivered

- Added workspace automation rules that run when a task changes to a selected status.
- Rules can optionally require a specific starting status.
- Added two actions: change the triggering task's priority or add a custom note to workspace activity.
- Added workspace-scoped creation, enable/pause, deletion, and listing endpoints with Guest write restrictions.
- Added a run history with success/failure status, rule, affected task, result summary, and time.
- Integrated rule execution into the task update flow. A task status update still succeeds if an automation action fails; the failed run is recorded when storage is available.
- Added an Automations workspace page with rule creation, active-state controls, confirmation before deletion, run totals, and recent history.
- No recurring schedule or external service is involved; rules run immediately on task status changes.

## Migration

Apply the checked-in schema migration and regenerate Prisma Client:

```bash
npm run db:migrate:deploy
npm run db:generate
```

The migration is `20261118194500_task_status_automations`.

## Verification

```bash
npm run typecheck
npm run db:validate
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

Manual review: create a rule for a status transition, update a task to that status, confirm its action took effect, and check the run log. Pause the rule and repeat; no new run should appear.

## Suggested commit

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118194500_task_status_automations apps/api/src/productivity/automations.controller.ts apps/api/src/productivity/automations.service.ts apps/api/src/productivity/productivity.module.ts apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/automations apps/web/app/workspace/workspace-navigation.ts apps/web/app/workspace/workspace-shell.tsx docs/sections/43-task-status-automations.md
git commit -m "feat: add task status automations"
git push origin main
```
