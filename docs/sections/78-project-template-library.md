# Project template library

The Projects workspace now treats templates as a reusable library. Users can search template names, descriptions, task titles, labels, and milestone names; filter by dependencies, relative dates, or milestones; and sort by update date, name, usage, or last use.

The detail preview shows the task outline, prerequisite links, milestones, and relative schedule. Templates can be duplicated in the current workspace or exported as a versioned `.aven-template.json` file. Imports are size limited and validated in the browser, then validated again by the API before they are saved.

## File format

The JSON envelope uses `format: "aven-project-template"` and `version: 1`. It stores the template name and description, task definitions with prerequisite indexes and relative due offsets, and milestone definitions with relative offsets. Workspace ownership, creators, usage counts, and completion states are not portable fields.

## Date behavior

Offsets are whole days in the inclusive range −3,650 through 3,650. When a template is applied, those offsets are recalculated from the current UTC calendar day. Null offsets remain undated.
