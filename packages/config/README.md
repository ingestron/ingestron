# @ingestron/config

Load a project defined in many YAML files: include parts of other files,
use values that change per environment, and validate every document
against a JSON Schema. Every problem is reported with its file, line and fix.

```yaml
# pipelines/orders.pipeline.yaml
apiVersion: example.dev/v1
kind: Pipeline
id: orders
table: raw_${environment.name}_orders # resolved when the project loads
columns: ${file:../shared/columns.yaml#/orders} # taken from another file
job_name: orders_$${bundle.target} # kept as ${bundle.target} for the output
```

## Install

```sh
pnpm add @ingestron/config
```

Requires Node 22.13 or later. The `@ingestron/config/core` entry point has
no Node dependencies and also runs in browsers and VS Code webviews.

Runtime dependencies, and why:

- [`yaml`](https://eemeli.org/yaml/): parses YAML with exact line and column
  positions, which every diagnostic relies on.
- [`ajv`](https://ajv.js.org/): validates documents against JSON Schema
  (2020-12, 2019-09 or draft-07), which editors and other languages also
  understand.

## A complete example

A folder with a manifest and one document:

```yaml
# definitions/project.yaml
id: sales
values:
  catalog: dev_catalog
environments:
  dev: {}
  prod:
    values:
      catalog: prod_catalog
imports:
  - "*.pipeline.yaml"
```

```yaml
# definitions/orders.pipeline.yaml
apiVersion: example.dev/v1
kind: Pipeline
id: orders
table: ${values.catalog}.sales.orders
```

Describe the kind of document, load the folder, and use the result:

```ts
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
}

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: {
    type: "object",
    required: ["apiVersion", "kind", "id", "table"],
    properties: { table: { type: "string" } },
  },
});

const result = loadProject("./definitions", {
  kinds: [pipeline],
  environment: "prod",
});

if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}

for (const document of result.project.all(pipeline)) {
  console.log(document.id, document.value.table); // orders prod_catalog.sales.orders
}
```

If something is wrong, you get every problem at once. For example, writing
`orders_${bundle.target}` (with one `$`) in the first file shown above gives:

```text
pipelines/orders.pipeline.yaml:7:11  error  UNKNOWN_REFERENCE
  "${bundle.target}" is not a reference.
  A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, ${file:<path>}, ${envvar:<name>} or ${secret:<name>}. To keep "${bundle.target}" as text, write "$${bundle.target}".
```

## The syntax on one page

| Write                   | Means                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `${values.a.b}`         | A project value, after the environment's values are merged in |
| `${environment.name}`   | The selected environment's name                               |
| `${project.id}`         | The manifest's `id` (also `project.name`)                     |
| `${file:path#/pointer}` | A value from another YAML file, or the text of any other file |
| `${envvar:NAME}`        | An environment variable of the machine that loads the project |
| `${secret:scope/key}`   | A secret reference, passed on as `{ $secret: "scope/key" }`   |
| `$${`                   | The literal text `${`, for placeholders meant for the output  |

Only text starting with `${` is interpreted. Everything else, including
`{{ }}`, `@{}`, `$(…)` and `$ref`, is passed on exactly as written.

## Documentation

- [Tutorial](docs/tutorial.md): build a multi-file project step by step.
- [How-to guides](docs/how-to.md): editor setup, output placeholders, secrets, CI.
- Reference: [syntax](docs/reference/syntax.md), [API](docs/reference/api.md),
  [diagnostics](docs/reference/diagnostics.md).
- [Explanation](docs/explanation.md): why the syntax looks the way it does.
- [Examples](examples/): eight small runnable projects, one concept each.
- [Specification](../../spec/config/syntax.md): the language-neutral rules,
  for anyone implementing them in another language.

## Licence

[MIT](LICENSE)

## Provenance

Imported from `intentlabs-dev/packages` at commit `cf0719d0` on 2026-10-31.
