# Section 1.9 · Live Home and My Tasks

**Milestone:** Phase 2.0 · Live workspace surface  
**Suggested commit:** `feat: connect live workspace home and my tasks`  
**Status:** Implemented; live record verification requires configured Clerk and PostgreSQL services.

## What this section adds

- A real My Tasks list for workspace tasks, with open, completed, and all filters.
- Status updates from My Tasks that are persisted through the workspace API.
- Calendar scheduling indicators for tasks linked to one or more saved calendar events.
- Home metrics based on actual projects and tasks: active projects, open tasks, due this week, and tasks scheduled.
- A short “Next up” list based on actual open task priority.
- Loading, empty, and error states instead of demo activity or invented statistics.

## Data access

My Tasks and Home use the existing authenticated workspace endpoints:

```text
GET   /api/v1/workspaces/:workspaceId/projects
GET   /api/v1/workspaces/:workspaceId/tasks
PATCH /api/v1/workspaces/:workspaceId/tasks/:taskId
```

The task list now includes linked calendar event summaries. All queries and updates continue to use workspace membership checks and workspace-scoped record access in the API.

## Local setup

Follow [Section 1.7 · Projects and tasks](07-projects-and-tasks.md) to configure and start Clerk, PostgreSQL, and the API. After creating projects, tasks, and calendar events, open Home or My Tasks to see the same saved records.

## Scope notes

My Tasks is a workspace-wide list for this first release slice. Personal assignments, saved filters, task editing beyond status, notifications, and activity history will be added in later slices. Home prioritises high-priority open tasks and shows factual counts; it does not make AI forecasts. Document editing and the complete first-use workflow remain future work.

## Review checklist

- [x] Read project and task data from the authenticated API.
- [x] Update task status through the API.
- [x] Show tasks scheduled through linked calendar events.
- [x] Replace home placeholder metrics and activity copy with live workspace values.
- [ ] Verify the complete flow with live Clerk and PostgreSQL services.
