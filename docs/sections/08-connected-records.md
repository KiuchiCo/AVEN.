# Section 1.8 · Connected records

**Milestone:** Phase 1.8 · Documents and calendar  
**Suggested commit:** `feat: connect project documents and task calendar`  
**Status:** Implemented; live integration requires configured Clerk and PostgreSQL services.

## What this section adds

- Workspace-scoped document list and create endpoints, with optional project links.
- Workspace-scoped calendar event list and create endpoints, with optional task links.
- Validation that linked projects and tasks belong to the same workspace as the new record.
- A Documents screen for writing notes and attaching them to projects.
- A Calendar screen for scheduling tasks and showing saved upcoming events.
- Honest loading, empty, and error states backed by API data.

## API

```text
GET    /api/v1/workspaces/:workspaceId/documents
POST   /api/v1/workspaces/:workspaceId/documents
GET    /api/v1/workspaces/:workspaceId/events
POST   /api/v1/workspaces/:workspaceId/events
```

Each endpoint requires a Clerk bearer token. The API resolves the stable AVEN user mapping and checks workspace membership. Project and task references are validated within the requested workspace before creating a connected record.

## Local setup

Follow [Section 1.7 · Projects and tasks](07-projects-and-tasks.md) to configure `.env`, start PostgreSQL and the API, apply migrations, and launch the web app. Then sign in, open **Documents** to save a project-linked note, or open **Calendar** to schedule a task.

## Scope notes

This first pass supports creating and listing project documents and task calendar events. Editing, deleting, calendar views, recurring events, reminders, and document collaboration are later work. Event times are stored as PostgreSQL timestamps with time zone; the form converts the browser's local time to an ISO timestamp before submission.

## Review checklist

- [x] Check workspace membership on reads and writes.
- [x] Reject document links to projects outside the current workspace.
- [x] Reject event links to tasks outside the current workspace.
- [x] Show persisted documents and events without fabricated sample content.
- [ ] Verify the workflow with live Clerk and PostgreSQL services.
