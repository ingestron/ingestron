# 01: Single file

The smallest project: a manifest and one document, with no references.

```
definitions/
  project.yaml            the manifest: project id and which files to import
  orders.pipeline.yaml    one document of kind Pipeline
run.ts                    defines the Pipeline kind, loads, prints
```

What to notice:

- `project.yaml` lists the documents to load with `imports` glob patterns.
- Every document starts with `apiVersion`, `kind` and `id`.
- `defineKind<Pipeline>` ties a TypeScript type to a JSON Schema, so
  `document.value.table` is typed.

Run it from `packages/config` (after `pnpm build`):

```sh
npx tsx examples/01-single-file/run.ts
```

## Expected output

```text
orders: raw_orders (daily)
```
