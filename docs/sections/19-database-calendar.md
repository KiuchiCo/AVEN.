# 1.19 · Database calendar views

## Goal

Show records with a date property on a month grid and let saved views preserve their selected date field.

## Delivered

- Added Calendar as a database view layout.
- Added a date-property selector and month navigation.
- Displayed filtered records in their matching local calendar days, with title and status context.
- Persisted the date property in saved views and validated it against the database schema.
- Added migration `20261117000700_database_calendar_views`.

## Review notes

- Calendar views require at least one date property.
- Records without a date value remain hidden from the month grid.
- The active database filter applies to the calendar as well as the other layouts.
