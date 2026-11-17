# 1.21 · Project schedules and task controls

This milestone groups the core project and task planning controls into one workflow update.

## Goal

Let workspace members plan project status and deadlines, schedule tasks, and adjust task priority while managing work on the project board.

## Delivered

- Added a workspace-scoped project update endpoint for project name, description, status, and due date.
- Added project status and optional due date to project creation and project cards.
- Added optional due dates when creating tasks, and inline task due-date editing.
- Added inline task priority editing and a priority filter for the task board.
- Added overdue cues for incomplete tasks whose due date has passed.
- Reused existing project and task date fields; no database migration is required.

## Review notes

- Project and task updates require workspace membership and scope writes to the active workspace.
- Clearing an optional due date sends `null` to the API.
- Task status changes and priority controls continue to save immediately.
