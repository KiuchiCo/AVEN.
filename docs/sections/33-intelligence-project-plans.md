# Section 1.33 · Reviewed project plans in Intelligence

**Milestone:** Phase 2 · Approved workspace actions  
**Suggested commit:** `feat: add reviewed project plans to intelligence`

## Delivered

- Added a project-plan composer to AVEN Intelligence for a project name, goal, target date, task outline, and milestone outline.
- Added a review step so the user can inspect the exact task and milestone list before saving.
- Added authenticated `POST /api/v1/workspaces/:workspaceId/intelligence/plans` with membership validation and limits on input length and plan size.
- Save creates the project, its tasks, its milestones, and a workspace activity entry in a single database transaction. A failed write leaves no partial plan behind.
- New tasks are created as To Do with Medium priority. The project starts in Planning; task due dates and milestone dates can be refined in their existing project workflows.
- No schema migration or external AI provider is required. The user supplies and approves the plan content.

## Review

1. In AVEN Intelligence, enter a project name, goal, tasks, and milestones.
2. Choose **Review plan** and inspect the summary and task list.
3. Edit the outline, review it again, then choose **Approve & create plan**.
4. Confirm the project, tasks, milestones, and activity entry appear in their workspace sections.
5. Try submitting a plan without tasks or milestones, or exceeding the allowed item count; the API should reject it without creating a partial project.

## Local checks

```sh
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Stage and commit when ready:

```sh
git add README.md apps/api/src/productivity/intelligence.controller.ts apps/api/src/productivity/intelligence.service.ts apps/web/app/workspace/intelligence/intelligence-workspace.tsx apps/web/app/globals.css docs/sections/33-intelligence-project-plans.md
git commit -m "feat: add reviewed project plans to intelligence"
git push origin main
```
