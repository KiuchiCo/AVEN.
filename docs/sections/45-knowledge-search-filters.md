# Section 1.45 · Knowledge search and filters

The Knowledge Hub now searches on the API with a short debounce instead of filtering only the items already loaded in the browser. Search covers titles, notes, and tags. Results can be narrowed to a project or a tag, and archive browsing supports the same filters.

The API returns a total count and fixed-size pages. **Load more references** appends the next page without replacing the visible cards. Project filters are validated against the active workspace, and search parameters are bounded before they reach the database.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

In the Knowledge Hub, search for a title or note, select a project, and enter a tag. Confirm the total count and cards update, then load another page if there are more than 50 matching items. Clear filters and check that archived references can be searched the same way.

## Commit and push

```bash
git add README.md docs/sections/45-knowledge-search-filters.md apps/api/src/productivity/knowledge.service.ts apps/api/src/productivity/knowledge.controller.ts apps/web/app/workspace/knowledge/knowledge-hub.tsx apps/web/app/globals.css
git commit -m "feat: add Knowledge Hub search filters"
git push origin main
```
