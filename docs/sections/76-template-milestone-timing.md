# Section 1.76 · Reusable milestone timing

Project templates now preserve milestone timing without carrying stale calendar dates into every new project. Saving a project as a template stores each milestone due date as an integer day offset from the save date. Applying the template recalculates those dates from the new project's creation day. Undated milestones stay undated, and every new milestone starts incomplete.

The template editor can adjust an offset directly: `0` is the template date, positive values are days after it, and negative values are days before it. Offsets are limited to ten years in either direction. Existing templates without offsets continue to produce undated milestones.

No database migration is required.

## Verification

- Save a project with milestones in the past, today, and the future; confirm the template stores the relative offsets.
- Apply the template on a later day and verify each milestone shifts by the same number of days.
- Edit an offset, remove a date, and add an undated milestone; save and apply again.
- Confirm all generated milestones start incomplete and are linked to the new project.
- Confirm invalid or out-of-range offsets are rejected and old templates remain usable.

Suggested commit after reviewing Section 1.76:

```sh
git add README.md apps/api/src/productivity/productivity.service.ts apps/web/app/workspace/projects/page.tsx docs/sections/76-template-milestone-timing.md
git commit -m "feat: reuse milestone timing in project templates"
git push origin main
```
