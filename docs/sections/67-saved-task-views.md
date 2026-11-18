# Section 1.67 · Saved task views

The task board now supports text search, status, priority, assignee, label, and due-date filters. Tasks can be sorted by due date in either direction, priority, or title. Users can save up to 20 named filter and sort presets, apply them later, and remove views they no longer need. Views include the selected project and are isolated by workspace in the current browser.

## Verification

- Search task titles, descriptions, project names, and labels.
- Combine status, priority, assignee, label, and due-date filters and verify board counts and cards update together.
- Confirm overdue excludes completed and cancelled tasks; verify today and next seven days use local calendar dates.
- Check all four sort orders.
- Save a named view, apply it after changing filters, then delete it.
- Confirm saved views are workspace-specific, survive a reload in the same browser, and do not appear in another browser.
- Confirm selection clears when changing filters, while exported CSV includes only currently visible tasks.

No database migration is required. Saved views currently live in browser storage and are not synchronized between devices or workspace members.

Suggested commit:

```sh
git add README.md apps/web/app/globals.css apps/web/app/workspace/projects/page.tsx docs/sections/67-saved-task-views.md
git commit -m "feat: add saved task board views"
git push origin main
```
