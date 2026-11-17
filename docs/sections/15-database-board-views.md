# 1.15 · Database board views

## Goal

Present database records as movable cards grouped by a status property, with the board layout saved as part of a named database view.

## Delivered

- Added a Table / Status board layout selector to the database view controls.
- Added status property grouping and columns for known and custom status values.
- Added drag and drop between status columns; moves persist through the workspace API.
- Saved the selected layout and grouping property in database views; existing saved views default to Table.
- Added migration `20261117000400_database_board_views`.

## Review notes

- Board layouts require at least one status property.
- Moving a card updates the record's status field; all other property values remain intact.
- Board grouping honors the active text filter and saved view.
- Workspace membership and database scoping remain enforced by the API.
