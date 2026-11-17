# 1.22 · Project milestones and progress

This milestone adds a durable project checkpoint workflow and a live progress summary.

## Goal

Give each project dated milestones and a concise view of completed task progress, backed by workspace-authorized persistence.

## Delivered

- Added the `ProjectMilestone` model and migration `20261117000900_project_milestones`.
- Added workspace-scoped milestone list, create, and update endpoints.
- Added milestone completion toggles and optional target dates to the Projects page.
- Added a selected-project progress summary calculated from its saved tasks.
- Kept milestone reads and writes scoped to both the active workspace and project.

## Review notes

- Milestones are deleted when their project or workspace is deleted.
- Project progress counts tasks with `COMPLETED` status; tasks without a project do not contribute.
- Apply the migration and regenerate Prisma Client before starting the API.
