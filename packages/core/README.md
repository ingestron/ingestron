# @ingestron/core

The Ingestron API, for tools built on Ingestron: hold a project open, see what
`plan` would write, compare two environments, write the platform request, and
choose a starter or a route for a new project. The `ingestron` command
([`@ingestron/cli`](../cli/README.md)) and the VS Code extension are built on
it. It reads definitions and returns values; it never writes to the terminal.

```sh
npm install @ingestron/core @ingestron/config @ingestron/generate
```

Requires Node 22.13 or later.

## A project held open

`Project.open(files, options?)` holds a project's files, the packs its standard
may name and the values `${envvar:…}` reads. Its generation, every environment
resolved and each pack's output, is worked out on first use and kept until
`refresh()`. `outputs()` gives it as `generatedOutputs` does (below), with
what `check` reports. `plan` and `request` use it; `compare` resolves the two
environments it is asked about. Nothing is written: apply a plan with
[`@ingestron/generate`](../generate/README.md). The values `${envvar:…}` reads
are never shown, so logging a project is safe.

`Project` is `@beta`: it may change in a minor release.

```ts
import { nodeFiles } from "@ingestron/config";
import { Project } from "@ingestron/core";
import { formatPlan, nodeFolder } from "@ingestron/generate";

const project = Project.open(nodeFiles("definitions"), { envvars: {} });
for (const output of project.generation().outputs) {
  const plan = project.plan(nodeFolder(`build/${output.folder}`), output.name);
  console.log(`${output.name}\n${formatPlan(plan)}`);
}
console.log(project.compare("dev", "prod"));
console.log(project.request("prod"));
```

`files` is the project as a `FileSource` from
[`@ingestron/config`](../config/README.md), such as `nodeFiles(folder)`.
`options.packs` defaults to the built-in packs, and `options.envvars` to
`process.env`. After the definitions change, call `project.refresh()`. `plan`
throws when the definitions have problems, listing them.

## The files plan would write

`generatedOutputs(files, { envvars?, packs? })` resolves every environment and
builds every output folder as `ingestron plan` does, and writes nothing.
Editors use it to preview the generated files and show the problems.

```ts
import { nodeFiles } from "@ingestron/config";
import { generatedOutputs } from "@ingestron/core";

const generated = generatedOutputs(nodeFiles("definitions"), { envvars: {} });
if (!generated.ok) console.log(generated.text);
for (const output of generated.outputs) {
  console.log(`${output.name} → build/${output.folder} (${output.targets.join(", ")})`);
  for (const path of Object.keys(output.files)) console.log(`  ${path}`);
  for (const value of output.deployValues ?? [])
    console.log(`  ${value.name} supplied as ${value.suppliedAs.join(", ")}`);
}
```

The result, `GeneratedOutputs`, has:

- `ok`: whether every environment resolved and every pack built its files;
- `outputs`: each output folder, as a `GeneratedOutput`, in the standard's
  pack order and then the passports; none unless `ok`;
- `environmentReports` and `packReports`: what resolving each environment, and
  building each pack that builds environments together, found, as `Report`s
  (`{ name, failed, diagnostics }`);
- `deployed`: the environments resolved for deploy, whose variables are read
  only when deploying;
- `refused`: the `PACK_LOAD` error when a pack cannot be loaded, in place of a
  throw;
- `text`: what `plan` prints before planning.

Each `GeneratedOutput` is `{ name, folder, targets, byEnvironment, files,
deployValues? }`: the pack's id or `products`, the folder under `build/`, the
environments it covers, whether each has a folder of its own (DuckDB and the
passports), the files at the paths `apply` writes them, and, for a pack that
builds environments together, the names the deploying pipeline supplies each
`${envvar:…}` as.

## Starters and routes for a new project

`ingestron init` and VS Code's New project choose from the same catalogue.
`builtInTemplates()` lists the starters. `projectSources()` returns source
IDs, titles and categories. `projectRoutes(connector, connectivity?)` returns
compatible routes, methods, reachability and maturity.
`projectRecipe(connector, via, connectivity)` returns a `ProjectRecipe`: the
definition files as the route writes them, and a `Template` that asks
nothing. None of them writes files; `ingestron init` creates the project.

```ts
import { builtInTemplates, projectRecipe, projectRoutes, projectSources } from "@ingestron/core";

console.log(builtInTemplates().map((template) => template.name));
const source = projectSources().find((item) => item.id === "postgresql")!;
const route = projectRoutes(source.id, "private")[0]!;
const recipe = projectRecipe(source.id, route.via, "private");
console.log(Object.keys(recipe.files));
```

The catalogue comes from the installed packs' metadata.

## Develop

```sh
pnpm install
pnpm --filter @ingestron/core validate
```

## Documentation

User documentation: https://docs.ingestron.io.

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
