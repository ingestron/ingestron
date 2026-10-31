# API reference

Two entry points:

| Import                   | Contains                                                  | Runs in                  |
| ------------------------ | --------------------------------------------------------- | ------------------------ |
| `@ingestron/config`      | Everything below, including `loadProject` and `nodeFiles` | Node 22.13+              |
| `@ingestron/config/core` | Everything except `loadProject` and `nodeFiles`           | Node, browsers, webviews |

## Loading

### `loadProject(folder, options): LoadResult`

Loads the project in a folder on disk. `${envvar:…}` reads `process.env`
unless `options.envvars` is given.

```ts
import { defineKind, loadProject } from "@ingestron/config";

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object" },
});
const result = loadProject("./definitions", { kinds: [pipeline], environment: "dev" });
console.log(result.ok);
```

### `resolveProject(files, options): LoadResult`

The same, from any `FileSource`. `envvars` defaults to none.

### `LoadOptions`

| Field         | Type                                  | Default          | Meaning                                       |
| ------------- | ------------------------------------- | ---------------- | --------------------------------------------- |
| `kinds`       | `KindDefinition[]`                    | (required)       | The kinds of document the project may contain |
| `environment` | `string`                              | none             | Environment whose values are merged in        |
| `envvars`     | `Record<string, string \| undefined>` | see above        | Variables for `${envvar:…}`                   |
| `manifest`    | `string`                              | `"project.yaml"` | Manifest path inside the project              |
| `limits`      | `Partial<Limits>`                     | `defaultLimits`  | Safety limits                                 |

### `LoadResult`

```ts
import type { Diagnostic, Project } from "@ingestron/config";

type LoadResult =
  | { ok: true; project: Project; diagnostics: Diagnostic[] } // diagnostics: warnings only
  | { ok: false; project?: undefined; diagnostics: Diagnostic[] };
```

After `if (!result.ok) …`, TypeScript knows `result.project` is set.

## Kinds

### `defineKind<T>(options): KindDefinition<T>`

| Option       | Type                     | Meaning                                                                                   |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| `apiVersion` | `string`                 | Must equal the document's `apiVersion`                                                    |
| `kind`       | `string`                 | Must equal the document's `kind`                                                          |
| `schema`     | `JsonSchema`             | JSON Schema for the whole document after resolution (see below for versions)              |
| `links`      | `Record<string, string>` | JSON Pointer pattern (with `*`) → `kind` name of the document it names (any `apiVersion`) |

`T` is the TypeScript type of a valid document. It is not checked at runtime;
keep it in step with the schema. `format` keywords are not checked, and
unknown keywords are ignored.

The schema is JSON Schema 2020-12, unless its `$schema` declares draft-07 or
2019-09. Published schemas, such as the ODCS data contract schema (2019-09),
can therefore be used unchanged.

Throws a `TypeError` immediately when the schema declares another JSON Schema
version, is not valid JSON Schema, or a
`links` key is not a JSON Pointer (such as `/source`). These are mistakes in
your code, so they fail fast instead of becoming project diagnostics.

## Projects

### `Project`

| Member          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| `id`, `name`    | From the manifest                                            |
| `environment`   | The selected environment's name, if any                      |
| `values`        | Values after the environment merge                           |
| `documents`     | Every `DefinitionDocument`, in file path order               |
| `all(kind)`     | Every document of a kind, typed as `DefinitionDocument<T>[]` |
| `get(kind, id)` | One document, or `undefined`                                 |

### `DefinitionDocument<T>`

`apiVersion`, `kind`, `id`, `file` (project path) and `value` (the whole
resolved document, of type `T`).

`locate(pointer)` returns where a value was written, for your own
diagnostics: `document.locate("/store/uses")` →
`{ file: "flows/orders.flow.yaml", line: 9, column: 9 }`. When the exact
value was not written (a default, or a part of a `${values.…}` value), the
nearest written parent is used, and finally the start of the document.

## Files

### `FileSource`

```ts
interface FileSource {
  list(): string[]; // every file path, relative to the root, using "/"
  read(path: string): string | undefined; // undefined when there is no such file
  size?(path: string): number | undefined; // optional: refuse large files before reading
}
```

### `memoryFiles(files)`

A `FileSource` over an object of `path → text`.

### `nodeFiles(folder)`

A `FileSource` over a folder. Skips `.git` and `node_modules`. Symbolic links
to files are followed when they stay inside the folder; links that point
outside it are treated as missing. Symbolic links to folders are not followed.

## Diagnostics

### `Diagnostic`

| Field      | Type                    | Meaning                                            |
| ---------- | ----------------------- | -------------------------------------------------- |
| `code`     | `DiagnosticCode`        | See the [diagnostics reference](diagnostics.md)    |
| `severity` | `"error" \| "warning"`  | Errors fail the load; warnings do not              |
| `message`  | `string`                | What is wrong                                      |
| `hint`     | `string \| undefined`   | How to fix it                                      |
| `location` | `Location \| undefined` | `{ file, line, column }`, lines and columns from 1 |
| `fixes`    | `Fix[] \| undefined`    | Changes that each solve the problem; see below     |

### `Fix`

A change that solves a problem, for an editor to offer and a person to
choose: a `title`, such as `Rename to "retries"`, and `edits`, applied
together. Each edit names a `file` and a JSON Pointer into its document, and
`set` (the value to write; a pointer ending in `/-` adds to a list),
`rename` (a new name for the key) or `remove: true` (removes the key or list
item, and a mapping or list it leaves empty). The loader offers fixes for an unknown
field close to a known one, a value that is not allowed, a missing field with
a default or example, and a link close to a known id. Packages built on this
one add their own.

### `fixEdits(fix, read): TextEdit[]`

The text edits that apply a fix: `{ file, start, end, text }`, offsets into
the file's current text, which `read(file)` returns. Only the values and keys
the fix names change; comments and layout elsewhere stay as written.

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyEdits, fixEdits, type Diagnostic } from "@ingestron/config";

/** Applies a diagnostic's first fix to the project in `folder`. */
export function applyFirstFix(folder: string, diagnostic: Diagnostic): void {
  const [fix] = diagnostic.fixes ?? [];
  if (!fix) return;
  for (const file of new Set(fix.edits.map((edit) => edit.file))) {
    const text = readFileSync(join(folder, file), "utf8");
    const edits = fixEdits(fix, () => text).filter((edit) => edit.file === file);
    writeFileSync(join(folder, file), applyEdits(text, edits));
  }
}
```

### `applyEdits(text, edits): string`

One file's text with its edits applied.

### `formatDiagnostics(diagnostics): string`

Text for a terminal or CI log. It accepts `AnyDiagnostic`, the same shape
with any `code`, so packages built on this one can report in the same
format:

```text
orders.pipeline.yaml:5:11  error  UNKNOWN_REFERENCE
  "${bundle.target}" is not a reference.
  A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, ${file:<path>}, ${envvar:<name>} or ${secret:<name>}. To keep "${bundle.target}" as text, write "$${bundle.target}".
```

When a diagnostic has fixes, the first is printed last, as `Fix: <title>.`

## Editor support

### `toEditorSchema(schema): JsonSchema`

A copy of a schema for editors, where non-text fields also accept a whole
reference and text fields reject an unescaped `${…}` that is not ours. See
[How to get validation in VS Code](../how-to.md#get-validation-and-completion-in-vs-code).

### `manifestSchema`

The JSON Schema of `project.yaml`, with a description of each field. Use it
as the editor schema for the manifest as it is; it needs no `toEditorSchema`.

## Other

| Export                                                                                             | Meaning                                                                             |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `isSecretReference(v)`                                                                             | True for `{ $secret: string }`, the value of `${secret:…}`                          |
| `defaultLimits`                                                                                    | `{ maxFileBytes: 10 MiB, maxIncludeDepth: 32, maxIncludes: 1000, maxAliases: 100 }` |
| `JsonSchema`, `Limits`, `Location`, `Severity`, `DiagnosticCode`, `SecretReference`, `KindOptions` | Types                                                                               |
