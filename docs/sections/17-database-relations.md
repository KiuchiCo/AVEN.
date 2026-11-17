# 1.17 · Relational database fields

## Goal

Connect a record to one or more records in another database in the same workspace.

## Delivered

- Added Relation as a property type and require a target database in the same workspace.
- Added normalized database record links with foreign keys, cascade cleanup, uniqueness, and lookup indexes.
- Added multi-select relation controls when creating and editing records.
- Return linked record IDs through the database API and render linked record names in table, board, and gallery layouts.
- Validate that each link points to a record in the configured target database and current workspace.
- Added migration `20261117000600_database_relations`.

## Review notes

- Relations are one-way properties; add a reciprocal relation field separately when needed.
- Each relation property can link to up to 100 records per source record.
- Deleting either linked record cascades its relation rows, preventing dangling links.
- Relations are visible across all current database layouts.
