# @ingestron/definitions

Reads Ingestron definitions (YAML) and resolves them, for one environment,
into a **model** that a pack turns into platform assets. It makes every
choice the standard leaves to it, so packs only build files:

- which method each table uses for ingest, transform, store and serve;
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

const result = loadDefinitions("definitions", {
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

## API

| Export                               | Meaning                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadDefinitions(folder, options)`   | Load from disk and resolve: `{ ok, model?, diagnostics }`                                                                                                   |
| `resolveDefinitions(files, options)` | The same from any `FileSource` (for example `memoryFiles`)                                                                                                  |
| `options`                            | `{ packs, environment?, envvars?, missingEnvvars?, deployTime?, environmentsTogether? }`: the available packs; the standard chooses among them              |
| `kinds`                              | The document kinds, for editor schemas or your own loading                                                                                                  |
| `ResolvedModel`, `ResolvedTable`, …  | The model's types; see `src/model.ts`                                                                                                                       |
| `Pack`, `PackInfo`, `Method`, `Rule` | What a pack declares; see `src/pack.ts`                                                                                                                     |
| `EnvironmentsBuild`                  | What a pack's optional `buildEnvironments(models)` returns: one set of files for every environment                                                          |
| `environmentsDiagnostics(problems)`  | The diagnostics for what `buildEnvironments` could not fold, and for its notices                                                                            |
| `PackNotice`                         | A `PACK_NOTICE` that `buildEnvironments` returns with its problems: a warning with the pack's message and hint, and a file when one definition causes it    |
| `compareTargets(models)`             | What differs between the targets of a pack that builds environments together: in more than values, with the standard messages, and every value that differs |
| `splitDeployText(text, values)`      | A text split into its literal parts and the deploy-time values in it                                                                                        |
| `checkFold(pack, models, { view })`  | For a pack's tests: whether its folded files give each target's own files, for one, two and more targets                                                    |
| `fullNameText(name)`                 | `catalog.schema.table`                                                                                                                                      |

`envvars` is the environment for `${envvar:…}`: `loadDefinitions` defaults
to `process.env` and `resolveDefinitions` to none. `.env.<environment>` and
`.env` in the project folder fill what it lacks.
`missingEnvvars` is `"error"` by default. An editor passes `"information"`:
an unset variable is then information, the project still resolves, and no
check judges a value that holds the unset reference. A `source` or `layer`
written with one keeps its tables. When the source holds one and no `uses`
names the ingest method, the table records it as `sourceNotKnown` and has no
steps; files are never generated from such a table.

`deployTime: true` is for packs that build every environment into one set of
files with `buildEnvironments`. Each `${envvar:NAME}` is then a value that the
pipeline deploying the files supplies: it is never read from `envvars` or a
`.env` file, it stays in the model as `${envvar:NAME}`, and
`model.deployValues` lists each one with the values it feeds. Such a value
cannot choose or name what is generated, such as a flow's `source` or a naming
pattern; there it is a `DEPLOY_VALUE` error.

`environmentsTogether: true` is for tools that generate every environment at
once, as the CLI from 2.0 does. The platform's `mode` is then `production` by
default for every environment except `dev`. Without it, `mode` is
`production` only for `prod` and `production`, as before 1.8.

`PackInfo.platformFields` lists the Platform fields a pack reads, such as
`["mode", "schedule.paused"]`, for tools to show. Each must be the path of an
entry of `documentReference("Platform")`, its keys joined with `.`. Resolving
throws when one is not, since the mistake is the pack's, not the project's.

`buildEnvironments` returns its notices among its `problems`. To read one,
narrow on `problem.code === "PACK_NOTICE"`: a notice may have no `file`.

`documentReference(kind)` and `methodReference(pack, method)` describe every
field once, each with its `minimum` and `maximum` when the schema gives them.
The values of a mapping are described as the field `*` under it when their
schema has a description, allowed values, a range, a default or an example.
An `anyOf` or `oneOf` names each alternative in its type, such as
`one of the values, or text`.

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

## Documentation

User documentation: https://docs.ingestron.io. The language-neutral rules for this package are in
[spec/definitions](https://github.com/ingestron/ingestron/tree/main/spec/definitions).

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
