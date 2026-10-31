# @ingestron/definitions

Reads Ingestron definitions (YAML) and resolves them, for one environment,
into a **model** that a pack turns into platform assets. It makes every
choice the standard leaves to it, so packs only build files:

- which method each table uses for ingest, transform and store;
- each method's settings, merged from the pack's smart defaults, the
  organisation's standard, the project's platform and the definitions;
- every name (catalog, schema, table, pipeline, job) from naming patterns;
- columns, keys and quality checks from each table's data contract;
- the platform setup for the environment.

Problems are reported with their file, line and column, and all of them are
found in one run.

Most people use this through the [`ingestron` command](../cli/README.md).
Use the package directly to build your own tools or packs.

## Example

```ts
import { formatDiagnostics } from "@ingestron/config";
import { loadDefinitions, type Pack } from "@ingestron/definitions";

declare const databricks: Pack; // from @ingestron/pack-databricks

const result = loadDefinitions("samples/starters/retail", {
  packs: [databricks],
  environment: "dev",
});
if (!result.model) {
  console.error(formatDiagnostics(result.diagnostics));
} else {
  for (const table of result.model.tables) {
    console.log(table.name, table.ingest?.method ?? table.transform?.method, table.store?.method);
  }
}
```

## Documentation

User documentation lives in the [docs site](../../apps/docs/content/docs/index.mdx). The rules other languages must follow are in the
[specification](../../spec/definitions/model.md).

## API

| Export                               | Meaning                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `loadDefinitions(folder, options)`   | Load from disk and resolve: `{ ok, model?, diagnostics }`                                 |
| `resolveDefinitions(files, options)` | The same from any `FileSource` (for example `memoryFiles`)                                |
| `options`                            | `{ packs, environment?, envvars? }`: the available packs; the standard chooses among them |
| `kinds`                              | The document kinds, for editor schemas or your own loading                                |
| `ResolvedModel`, `ResolvedTable`, …  | The model's types; see `src/model.ts`                                                     |
| `Pack`, `PackInfo`, `Method`, `Rule` | What a pack declares; see `src/pack.ts`                                                   |
| `fullNameText(name)`                 | `catalog.schema.table`                                                                    |

`Connector.reading` optionally describes a native table reader's query support,
accepted source options, landing format and required runtime. Packs derive this
metadata from their validation rules; it does not add fields to connection YAML.
For example, `{ query: "optional", sourceOptions: [], format: "parquet" }` describes
a reader that accepts an optional query and has no connector-specific options.

## Dependencies

- [`@ingestron/config`](../config): loading
  with `${…}` references, environments, includes, schemas and locations.
- [`ajv`](https://ajv.js.org/): checks each method's merged settings.
- [`liquidjs`](https://liquidjs.com/): renders name patterns.
- [`yaml`](https://eemeli.org/yaml/): reads the schemas shipped in `schemas/`.

`schemas/odcs-v3.1.0.schema.json` is the Open Data Contract Standard schema,
unchanged, under the Apache License 2.0; see [schemas/NOTICE.md](schemas/NOTICE.md).
