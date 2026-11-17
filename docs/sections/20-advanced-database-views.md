# 1.20 · Advanced database views

This larger milestone bundles the remaining core database presentation layouts in the product brief.

## Goal

Add compact List, dated Timeline, and grouped Chart views to database tables, and persist each configuration as a saved view.

## Delivered

- Added List layout for compact record scanning.
- Added Timeline layout for dated records across a navigable month, with date markers and title labels.
- Added Chart layout that groups records by status and displays either record counts or sums of a numeric property.
- Added saved view fields for chart measures and API validation for chart/date configuration.
- Updated the README's current state to reflect shipped functionality and remaining product phases.
- Added migration `20261117000800_advanced_database_views`.

## Review notes

- Timeline and Calendar share a selected date property and month navigation.
- Charts require a status field; a numeric measure is optional, with counts as the default.
- Timeline markers represent point dates because this milestone does not add date-range properties.
- Existing view types and saved-view filters continue to work.
