# 1.24 · Task ownership and workload

This milestone connects task assignment to workspace membership and adds a live workload summary.

## Goal

Let workspace members own tasks and make open work distribution visible from the Projects area.

## Delivered

- Added a membership-scoped endpoint to list workspace members for assignment controls.
- Added assignee validation to task creation and updates; assignees must belong to the active workspace.
- Included assignee display names in task responses.
- Added assignee selection to task creation and task cards, including the ability to clear an assignment.
- Added a workload summary showing open tasks per workspace member and unassigned work.
- Updated the project state summary in the README.

## Review notes

- Workload counts exclude completed and cancelled tasks.
- This uses existing task assignment and workspace membership fields; no migration is required.
- The current Clerk bootstrap creates a personal workspace, so multiple-member assignment becomes useful once membership invitations are implemented.
