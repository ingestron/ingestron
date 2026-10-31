# How-to guides

Short recipes for common tasks. Each assumes you have done the
[tutorial](tutorial.md) or know the basics.

- [Get validation and completion in VS Code](#get-validation-and-completion-in-vs-code)
- [Keep a placeholder for a generated file](#keep-a-placeholder-for-a-generated-file)
- [Generate output files from definitions](#generate-output-files-from-definitions)
- [Use secrets](#use-secrets)
- [Fail a CI build on definition errors](#fail-a-ci-build-on-definition-errors)
- [Load definitions in a browser or editor](#load-definitions-in-a-browser-or-editor)
- [Keep schemas in YAML files](#keep-schemas-in-yaml-files)
- [Change the safety limits](#change-the-safety-limits)

## Get validation and completion in VS Code

Uses the standard [YAML extension by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml).

1. Write an editor schema for each kind, and the manifest's schema as it is
   (the manifest is read literally, so it needs no conversion):

   ```ts
   import { writeFileSync } from "node:fs";
   import { defineKind, manifestSchema, toEditorSchema } from "@ingestron/config";

   const pipeline = defineKind({
     apiVersion: "example.dev/v1",
     kind: "Pipeline",
     schema: { type: "object", properties: { workers: { type: "integer" } } },
   });

   writeFileSync("schemas/project.editor.json", JSON.stringify(manifestSchema, null, 2));
   writeFileSync(
     "schemas/pipeline.editor.json",
     JSON.stringify(toEditorSchema(pipeline.schema), null, 2),
   );
   ```

2. Associate the schemas with files, either with a first line in each file:

   ```yaml
   # yaml-language-server: $schema=../schemas/pipeline.editor.json
   ```

   or once for the workspace in `.vscode/settings.json`:

   ```json
   {
     "yaml.schemas": {
       "./schemas/project.editor.json": "definitions/project.yaml",
       "./schemas/pipeline.editor.json": "definitions/**/*.pipeline.yaml"
     }
   }
   ```

The editor then accepts `workers: ${values.workers}` but flags `workers: 4x`
and `job: ${bundle.target}`. Hover shows each field's `description` from your
schema, so describe the fields you want explained. Regenerate the schemas when
a kind's schema changes. Full example: [07-editor-setup](../examples/07-editor-setup/).

## Keep a placeholder for a generated file

When a definition value is meant for another tool, and that tool uses `${…}`
too (Databricks bundles, Spark SQL, Bicep, GitHub Actions), write `$${`
instead of `${`:

```yaml
job_name: orders_$${bundle.target} # output: orders_${bundle.target}
cluster_id: $${var.cluster_id} # output: ${var.cluster_id}
condition: $${{ github.ref == 'refs/heads/main' }} # output: ${{ … }}
```

Placeholders that do not start with `${` need nothing:
`{{ run_date }}`, `@{pipeline().parameters.x}`, `$(Build.SourceBranch)`,
`%{ if x }` and `$ref` are passed on as written.

If you forget, the load fails and the hint shows the escaped form; nothing is
changed silently. For code with many placeholders, keep it in its own file and
use `${file:query.sql}`: file contents are never interpolated.

## Generate output files from definitions

Build the output as data and serialise it with a YAML or JSON library. Never
paste definition values into YAML text, because a value containing `:` or
`${` would then change the meaning of the output:

```ts
import { stringify } from "yaml";
import { defineKind, loadProject } from "@ingestron/config";

const pipeline = defineKind<{ id: string; job_name: string }>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["job_name"] },
});

const result = loadProject("./definitions", { kinds: [pipeline] });
if (result.ok) {
  const jobs = Object.fromEntries(
    result.project.all(pipeline).map(({ value }) => [value.id, { name: value.job_name }]),
  );
  console.log(stringify({ resources: { jobs } }));
}
```

Keep definitions and generated files apart: give definitions their own folder
and file suffix (for example `*.pipeline.yaml` under `definitions/`), so that
the generated tool's own globs (such as a bundle's `include: resources/*.yml`)
never pick them up. Full example: [08-bundle-passthrough](../examples/08-bundle-passthrough/).

## Use secrets

Write `${secret:scope/key}` as a whole value:

```yaml
password: ${secret:sales/erp-password}
```

The loader never reads secrets. The value becomes `{ "$secret": "sales/erp-password" }`,
which your tool turns into whatever its target needs (a Key Vault reference,
a Databricks secret scope lookup, …). Use `isSecretReference(value)` to
recognise one. A secret cannot be part of longer text (`SECRET_IN_TEXT`):
that would put it into logs and generated files.

In the kind's schema, describe the field as the resolved shape:

```yaml
password:
  type: object
  required: [$secret]
  properties:
    $secret: { type: string }
```

## Fail a CI build on definition errors

```ts
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object" },
});

for (const environment of ["dev", "prod"]) {
  const result = loadProject("./definitions", { kinds: [pipeline], environment, envvars: {} });
  if (result.diagnostics.length > 0) console.log(formatDiagnostics(result.diagnostics));
  if (!result.ok) process.exit(1);
}
```

Check every environment: a value that only one environment overrides can only
break there. `envvars: {}` makes the check independent of the CI machine;
leave it out if your definitions use `${envvar:…}` and the CI job sets them.

## Load definitions in a browser or editor

Import from `@ingestron/config/core`, which has no Node dependencies, and
supply the files yourself:

```ts
import { defineKind, memoryFiles, resolveProject } from "@ingestron/config/core";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object" },
});

const files = memoryFiles({
  "project.yaml": "id: demo\nimports: ['*.pipeline.yaml']\n",
  "orders.pipeline.yaml": "apiVersion: example.dev/v1\nkind: Pipeline\nid: orders\n",
});

const result = resolveProject(files, { kinds: [pipeline] });
console.log(result.ok);
```

For an editor, implement `FileSource` (`list()` and `read(path)`) over the
editor's open documents, so unsaved changes are checked too.

## Keep schemas in YAML files

Schemas in their own files can be shared with editors, documentation and other
languages:

```ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { defineKind, type JsonSchema } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: parse(readFileSync("schemas/pipeline.schema.yaml", "utf8")) as JsonSchema,
});
console.log(pipeline.kind);
```

## Change the safety limits

The defaults (10 MiB per file, 32 nested includes, 1000 includes per load,
100 YAML alias expansions) are far above what normal projects use. Raise one only when a
real project needs it:

```ts
import { defineKind, loadProject } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object" },
});
const result = loadProject("./definitions", {
  kinds: [pipeline],
  limits: { maxFileBytes: 50 * 1024 * 1024 },
});
console.log(result.ok);
```
