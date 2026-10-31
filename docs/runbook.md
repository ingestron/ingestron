# Runbook

## Validate

```sh
pnpm install --frozen-lockfile
pnpm validate
```

## Release (private)

1. Update `version` in the changed packages' `package.json` and note the
   change in the commit message.
2. `pnpm validate`, plus in `packages/cli` `pnpm check:bundle` with the
   schema of the Databricks CLI version in use and `pnpm check:parity`.
3. `pnpm -r pack`, and record each archive's SHA-256 with the release
   evidence.
4. Consumers install that archive; there is no registry publication.

## Recover

- **`LOCKED` after a crash:** confirm no generation is running, then delete
  `.generated.lock` in the output folder.
- **`BAD_MANIFEST`:** restore `.generated.json` from version control. If it is
  lost, delete the generated files and the manifest, and generate again.
- **`WRITE_FAILED` … Nothing was changed:** the folder was restored; fix the
  cause (permissions, disk space) and apply a fresh plan.
- **`WRITE_FAILED` … Some files could not be put back, or a crash during
  apply:** the folder may hold a mix of old and new files. Restore it from
  version control (or delete the lock and apply the same definitions again),
  then run `check`.

## Docs site

Serve it while writing: `pnpm --filter @ingestron/docs dev`. `pnpm validate`
builds it, checks every internal link and download, and fails when a
connector has no page or no example.

After a structural change, look at the built site (`apps/docs/out`) at
desktop and phone width, in light and dark, with the keyboard and search.

Review 2026-10-25 (local static build, headless Chromium 1280×800 and
390×844, light and dark): overview, first project, SQL Server, packs,
errors and troubleshooting pages. No page scrolls sideways; wide tables and
code scroll inside their block; no console errors; every focus stop shows
the outline; search finds prose, including inline code. Fixed: a duplicate
"Connectors" entry in the sidebar. Reference rendered from code (error codes,
method settings, CLI commands) is added to the search index by
`apps/docs/lib/search.ts`. Deployment to docs.ingestron.io is not done and needs the
owner's approval.
