# Section 1.29 · Task dependencies

## Goal

Let project members show which tasks must finish before another task can be completed.

## Delivered

- Add persisted task-to-task prerequisite relationships in PostgreSQL.
- Keep prerequisites inside the same workspace and project, including unassigned project work.
- Expose dependency data in the workspace task response and add an endpoint for replacing a task's prerequisite list.
- Reject self-dependencies, duplicate IDs, cross-project links, and links that would create a cycle.
- Prevent completion while any prerequisite is not complete, with a message naming the remaining tasks.
- Add prerequisite selection and open prerequisite counts to the project workspace task list.
- Record dependency changes in the workspace activity feed.

## Scope notes

Dependencies are project-scoped. This section does not calculate critical path dates, automatically shift schedules, or infer dependencies from task order. Reopen a completed task before adding prerequisites to it.

## API

```text
PUT /api/v1/workspaces/:workspaceId/tasks/:taskId/dependencies
{ "dependsOnTaskIds": ["<task UUID>"] }
```

Send the complete prerequisite ID list; an empty list removes all prerequisites for that task.

## Data change

The migration creates Prisma's implicit `_TaskDependencies` join table. Apply migrations and regenerate Prisma Client before starting the API:

```bash
npm run db:migrate:deploy
npm run db:generate
```

## Review

1. Open a project's workspace and select a prerequisite for one task.
2. Try to mark the dependent task complete; confirm the API names unfinished prerequisites and rejects the update.
3. Complete the prerequisite and complete the dependent task.
4. Try to make a chain that links back to its first task; confirm the cycle is rejected.
5. Confirm a task from another project is unavailable as a prerequisite.

Suggested commit message: `feat: add project task dependencies`
