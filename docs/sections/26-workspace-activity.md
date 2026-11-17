# 1.26 · Workspace activity feed

This milestone adds a durable activity log for the main productivity workflows.

## Goal

Keep a workspace-scoped record of who made changes across projects, tasks, milestones, documents, and calendar events.

## Delivered

- Added `WorkspaceActivity` with actor, workspace, entity, message, and timestamp fields.
- Added migration `20261117001000_workspace_activity`.
- Recorded create and update actions for projects, tasks, milestones, documents, and calendar events.
- Added an authenticated activity endpoint, limited to the latest 100 workspace events.
- Replaced the Activity placeholder route with a feed and filters by change type.

## Review notes

- Every activity read verifies workspace membership.
- Activity entries are removed when their actor or workspace is deleted; entity references are retained as typed identifiers without hard foreign keys.
- Database management changes are not yet included in this feed.
