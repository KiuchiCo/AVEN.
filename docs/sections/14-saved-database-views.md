# 1.14 · Saved database views

## Goal

Let workspace members save a database's current filter and sort settings as a named view, restore it later, and delete saved views they no longer need.

## Delivered

- Added persistent `DatabaseView` records scoped to a workspace and database.
- Added authenticated endpoints to list views with the database, save a view, and delete a view.
- Validated view names, filter length, sort direction, and database-owned sort properties on the API.
- Added a saved-view selector and save/delete controls to the database table UI.
- Added migration `20261117000300_database_views`.

## Review notes

- View names are unique within one database.
- Views preserve the text filter, sort property, and ascending/descending order.
- Changing the filter or sort switches the selection back to a custom view.
- Records and saved views continue to require workspace membership.
