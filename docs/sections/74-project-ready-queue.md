# Section 1.74 · Project ready queue

Project overview now separates open work into tasks that are ready to start and tasks waiting on prerequisites. The ready queue prioritizes higher-priority tasks first, then earlier due dates. A To do task can be started directly from the queue; other ready tasks link to their task details. The blocked list names unfinished prerequisites so the team can see what needs attention.

No database migration is required.

## Verification

- Confirm the ready count includes open tasks whose prerequisites are all completed.
- Confirm blocked tasks and the specific unfinished prerequisites appear in the waiting list.
- Start a To do task and confirm its status changes to In progress and the queue refreshes.
- Verify higher-priority and earlier-due tasks appear first.
- Confirm projects with no tasks or no ready tasks show a useful empty state.

Suggested combined commit for Sections 1.73 and 1.74 after review:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/73-task-dependency-filters.md 'apps/web/app/workspace/projects/[projectId]/page.tsx' docs/sections/74-project-ready-queue.md
git commit -m "feat: add dependency-aware task planning"
git push origin main
```
