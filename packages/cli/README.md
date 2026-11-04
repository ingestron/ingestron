# @ingestron/cli

The `ingestron` command: generates platform assets from definitions, as the
organisation's standard says, safely.

```sh
ingestron plan      # what would change in each pack's output folder, with diffs
ingestron apply     # write it; files edited by hand are never overwritten
ingestron check     # for CI: fail when the output is not up to date
ingestron schemas   # editor schemas for VS Code's YAML extension
```

It loads the definitions with [`@ingestron/definitions`](../definitions/README.md),
builds the files with the packs its standard names, such as the
[Databricks pack](https://github.com/ingestron/pack-databricks), and
writes them with [`@ingestron/generate`](../generate/README.md). Every
environment is generated together, into one folder per pack: `build/<pack>/`.
A pack that builds every environment into one artefact, such as one
Databricks bundle with a target per environment, writes it there; any other
pack, such as DuckDB, writes each environment's files in
`build/<pack>/<environment>/`. Data product passports go in
`build/products/<environment>/`.

## In code

```ts
import { run } from "@ingestron/cli";

const code = run(["check"], {
  cwd: "definitions",
  write: (text) => process.stdout.write(text),
});
process.exitCode = code;
```

## Project builder API

The package also exposes the catalogue and the composed questions that
`ingestron init` and VS Code's New project use. `projectSources()` returns
source IDs, titles and categories. `projectRoutes(connector, connectivity?)`
returns compatible routes, methods, reachability and maturity.
`projectRecipe(connector, via, connectivity)` returns a `ProjectRecipe`
containing the selected definition files and a `Template` with configuration
questions. It reads the packaged recipes but writes no project files. Use `run`
to apply answers, validate and create the project:

```ts
import { projectSources, projectRoutes, projectRecipe, run } from "@ingestron/cli";

const source = projectSources().find((item) => item.id === "postgresql")!;
const route = projectRoutes(source.id, "private")[0]!;
const recipe = projectRecipe(source.id, route.via, "private");
console.log(recipe.template.questions);
const code = run(
  [
    "init",
    "sales",
    "--connector",
    source.id,
    "--via",
    route.via,
    "--connectivity",
    "private",
    "--yes",
  ],
  { cwd: process.cwd(), write: (text) => process.stdout.write(text) },
);
process.exitCode = code;
```

The exported `ProjectSource`, `ProjectRoute` and `ProjectRecipe` types describe
these plain objects. The catalogue comes from installed pack metadata; a
selected standard is checked during creation, before any files are written.

## Checking generated bundles

`pnpm check:bundle <schema.json>` checks the Databricks bundle generated for every
project template and test fixture against the output of `databricks bundle
schema`, from the Databricks CLI you deploy with.

## Documentation

User documentation: https://docs.ingestron.io. The language-neutral rules for this package are in
[spec/cli](https://github.com/ingestron/ingestron/tree/main/spec/cli).

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
