# Section 1.12 · Custom database properties

**Milestone:** Phase 2 · Flexible structured records  
**Suggested commit:** `feat: add custom database properties`  
**Status:** Implemented; verify with a live Clerk session and PostgreSQL.

## What this section adds

- Add workspace database properties for text, number, checkbox, date, and status values.
- Render property columns and record inputs from the saved database definition.
- Validate property names and values in the API, including duplicate property names.
- Keep record edits scoped to the selected database and workspace.

## API

```text
PATCH /api/v1/workspaces/:workspaceId/databases/:databaseId/properties
```

Property names must be unique within a database and at most 80 characters. Record payloads can only set properties defined on that database.

## Review

Add a property of each supported type, create and edit records, and refresh to check that values persist. The next database slice can add filtering, sorting, and saved views.
