# Section 1.31 · Database formulas and relationship map

**Milestone:** Phase 2 · Richer workspace databases  
**Suggested commit:** `feat: add database formulas and relation map`

## Delivered

- Added read-only Formula properties that calculate from numeric fields with arithmetic, parentheses, and `SUM`, `MIN`, `MAX`, `ROUND`, and `ABS` functions.
- Formulas can reference other formulas. The API validates field references and rejects circular calculations; client requests cannot set formula values.
- Calculated values are returned by the database API, included in table exports, and available to filters, sorting, charts, and other views.
- Added a relationship map that shows the selected database, each configured related database, and the number of linked records.
- Formula columns are omitted from record entry and editing, and CSV imports reject calculated columns.
- No migration is required: formula expressions are stored alongside existing property definitions in the database JSON field.

## Formula syntax

Reference a number property by its name in square brackets, for example `[Quantity] * [Unit price]`. Use parentheses to control calculation order. Functions accept numeric expressions, such as `ROUND([Subtotal] * 1.1, 2)` or `SUM([Materials], [Labour])`. Blank number cells count as zero; division by zero produces a blank calculated value.

## Review

1. Add number properties named `Quantity` and `Unit price` and create at least one record with values.
2. Add a Formula property named `Line total` with `[Quantity] * [Unit price]`; confirm the value appears and updates when either source number changes.
3. Add a second formula that references `Line total`; confirm nested calculations work.
4. Try a misspelled field reference and a circular formula; the API should reject each definition.
5. Open Relations on a database with a relation property. Confirm it shows the target table and link count.
6. Export CSV and confirm formula values are included; importing a formula column should be rejected.

## Local checks

```sh
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Stage and commit when ready:

```sh
git add apps/api/src/productivity/databases.service.ts apps/web/app/workspace/connected-databases.tsx apps/web/app/globals.css docs/sections/31-database-formulas-and-relations-map.md README.md
git commit -m "feat: add database formulas and relation map"
git push origin main
```
