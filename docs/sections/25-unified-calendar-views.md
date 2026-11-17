# 1.25 · Unified calendar views

This milestone turns the basic event list into a browsable workspace schedule.

## Goal

See scheduled events and task deadlines together, navigate dates, and create events directly for a chosen day.

## Delivered

- Added a Monday-first month calendar with date navigation and a Today control.
- Added an Agenda view for the combined schedule.
- Displayed open task due dates alongside scheduled calendar events.
- Added a selected-day detail list and quick date selection for the event form.
- Kept event records and task deadlines linked to their original workspace data.
- Updated the README's current product state.

## Review notes

- Task deadlines are shown as all-day items; scheduled events retain their time and optional duration.
- The calendar uses the browser's local timezone for display and event-form defaults.
- Recurrence, external calendar connections, and drag-to-reschedule remain future work.
