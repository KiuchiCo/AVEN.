# AVEN.

**Your entire world, organised.**

AVEN is a productivity workspace that brings projects, documents, databases, calendar, and AI assistance into one connected application. This repository is being built in small, reviewable sections so each milestone can be committed and pushed independently.

## Project sections

| Section | Focus | Status |
| --- | --- | --- |
| [00 · Product foundation](docs/sections/00-product-foundation.md) | Product principles, first release scope, and delivery plan | In progress |
| [01 · Application shell](docs/sections/01-application-shell.md) | Responsive navigation, workspace switcher, and dashboard starting point | In progress |
| 02 · Authentication and accounts | Sign in, account settings, and workspace membership | Planned |
| 03 · Projects | Tasks, boards, milestones, and project overview | Planned |
| 04 · Documents | Create, edit, and organise workspace documents | Planned |
| 05 · Databases | Structured records, views, and relationships | Planned |
| 06 · Calendar | Events, task deadlines, and time blocking | Planned |
| 07 · AVEN Intelligence | Workspace-aware assistant and approved actions | Planned |

The fuller product direction and implementation principles are in [the product foundation](docs/sections/00-product-foundation.md).
The shared visual language is documented in the [AVEN design system](docs/AVEN-DESIGN-SYSTEM.md).

## Working on a section

Sections are designed to be small enough to review before you publish them. For each one:

1. Review the section brief and the changes in the working tree.
2. Run the section's verification steps.
3. Commit with the suggested message in that brief, then push your branch.

Suggested first commit: `docs: define AVEN product foundation`

Suggested shell commit: `feat: add responsive AVEN application shell`

## Current state

This repository is at the product brief and first application shell stage. It uses plain HTML, CSS, and JavaScript so the initial experience can be explored without installing packages. A framework, backend, and database can be selected when their section is planned.
