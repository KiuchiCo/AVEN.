# Section 1.7 · Projects and tasks

**Milestone:** Phase 1.7 · First productivity slice  
**Suggested commit:** `feat: add workspace projects and task board`  
**Status:** Implemented; local sign-in and database verification require configured services.

## What this section adds

- Authenticated project list and create endpoints scoped to a workspace.
- Authenticated task list, create, and status update endpoints.
- Membership checks for every request, plus same-workspace checks for project-linked tasks.
- Basic input validation for names, statuses, priorities, dates, and project references.
- A project screen in AVEN with persisted project/task forms and a four-column task board.
- Honest loading, empty, and error states; the board only displays records returned by the API.

## API

```text
GET    /api/v1/workspaces/:workspaceId/projects
POST   /api/v1/workspaces/:workspaceId/projects
GET    /api/v1/workspaces/:workspaceId/tasks
POST   /api/v1/workspaces/:workspaceId/tasks
PATCH  /api/v1/workspaces/:workspaceId/tasks/:taskId
```

Requests require a Clerk bearer token. The API resolves its stable identity mapping to an AVEN user, verifies membership, and includes the workspace ID in all project and task queries. A task cannot reference a project from another workspace.

## Local setup

Set the Clerk values and `DATABASE_URL` in the root `.env`, then run:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
npm run dev:api
```

In another terminal, start the web app with `npm run dev`, sign in, and open **Projects**. Projects and tasks are stored in PostgreSQL, so they remain after refresh.

## Scope notes

The first board supports project creation, task creation, workspace task listing, and task status updates. Project status editing, assignment, comments, drag-and-drop, filters, pagination, and role-specific write policies remain later work. Workspace membership is enforced; the first slice lets any workspace member create and update tasks.

## Review checklist

- [x] Do not show fabricated project or task records.
- [x] Authenticate all productivity endpoints with Clerk.
- [x] Check workspace membership on reads and writes.
- [x] Scope every record lookup/update to the requested workspace.
- [x] Reject a linked project that belongs to a different workspace.
- [ ] Verify with a live Clerk session and PostgreSQL database.
