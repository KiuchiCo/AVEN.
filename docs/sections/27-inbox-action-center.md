# 1.27 · Inbox action center

This milestone makes the Inbox a practical task triage surface using the existing workspace task model.

## Goal

Bring overdue, near-term, and high-priority work into one queue with quick status changes.

## Delivered

- Added counts for tasks needing attention, overdue tasks, work due this week, and active projects.
- Added queue filters for all attention items, overdue items, due-this-week items, high-priority items, and all open tasks.
- Sorted each queue by due date and priority.
- Added quick task status updates, which persist through the workspace API and appear in Activity.
- Added an empty state and links to project management.

## Review notes

- Attention includes any overdue task, any task due within seven days, and any open High or Urgent task.
- The Inbox is a derived view over existing tasks; it adds no database migration or notification state.
