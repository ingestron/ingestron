# @ingestron/generate

Writes a set of generated files into a folder safely:

- **Plan first.** See what would be created, updated or deleted, with line
  diffs, before anything is written.
- **Never lose an edit.** A file someone changed by hand, or a file that was
  never generated, is never overwritten or deleted. It is reported instead.
- **Put back on failure.** If writing fails half-way, the files already
  changed in that folder are put back. If putting one back also fails, or the
  process is killed, the folder can be left part-written; restore it from
  version control and apply again.
- **Know when it is stale.** In CI, check that committed files match what the
  definitions generate today.

It does not decide what to generate. You give it the wanted files, path →
text, and it takes care of writing them.

Requires Node 22.13 or later. No runtime dependencies: only Node's own `fs`,
`path` and `crypto`.

## Example

```ts
import { applyPlan, formatPlan, nodeFolder, planGeneration } from "@ingestron/generate";

const folder = nodeFolder("build/bundle");
const plan = planGeneration(folder, {
  "databricks.yml": "bundle:\n  name: retail\n",
  "resources/orders.job.yml": "resources:\n  jobs:\n    orders: {}\n",
});

console.log(formatPlan(plan, { diffs: true }));
if (plan.clean) {
  const result = applyPlan(folder, plan);
  if (!result.ok) console.error(result.problems.map((problem) => problem.message).join("\n"));
}
```

The first run prints:

```text
create    databricks.yml
create    resources/orders.job.yml

2 files: 2 create. Ready to apply.
```

Applying writes the two files and `.generated.json`, a manifest that records
each generated file with a digest of its content. Commit the manifest with
the generated files: it is how the next run tells generated files from yours.

## How a path is decided

| The file on disk…                       | Wanted      | No longer wanted |
| --------------------------------------- | ----------- | ---------------- |
| does not exist                          | `create`    | `forget`         |
| is exactly what was generated last time | `update`    | `delete`         |
| already has the wanted content          | `unchanged` | –                |
| was changed by hand                     | `conflict`  | `conflict`       |
| exists but was never generated          | `conflict`  | not touched      |

A plan with any conflict cannot be applied. The full table, including
`adopt`, is under [Changes](#changes).

## API

### Functions

#### `planGeneration(folder, wanted): Plan`

Compares `wanted` (path → text) with `folder` and its manifest. Never writes.

| Plan field     | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `changes`      | One [`Change`](#change) per path that is wanted or was generated, in path order |
| `problems`     | [Problems](#problems) that make the plan impossible to apply                    |
| `clean`        | No problems and no conflicts: `applyPlan` will accept it                        |
| `upToDate`     | Clean, and every change is `unchanged`                                          |
| `wanted`       | A copy (`Map`) of the wanted files; applying writes exactly these               |
| `manifestSeen` | What the manifest was when planning, so later changes are detected              |

Wanted paths are relative, use `/`, and must not contain empty, `.` or `..`
parts, `\`, `:` or NUL, be `.generated.json` or `.generated.lock`, lie in a
`.git` folder, or differ from another wanted path only in letter case.

#### `applyPlan(folder, plan): ApplyResult`

Applies a clean plan:

1. Refuses a plan that is not clean (`PLAN_HAS_CONFLICTS`).
2. Takes the folder's lock (`LOCKED` if held), released at the end.
3. Checks every path and the manifest are as they were when planning
   (`CHANGED_SINCE_PLAN`), before writing anything.
4. Writes `create` and `update` files, removes `delete` files and folders
   left empty, then writes the manifest.
5. On failure, puts back every file it changed (`WRITE_FAILED`). The message
   ends “Nothing was changed.” when that worked and “Some files could not be
   put back.” when it did not. This covers one folder and an error the process
   sees; it does not survive the process being killed.

`ApplyResult` is `{ ok: boolean; problems: Problem[] }`.

#### `formatPlan(plan, options?): string`

Text for a terminal or review comment: one line per change except
`unchanged`, an explanation under each conflict and problem, and a summary.
`{ diffs: true }` adds the line diff under each update.

#### `nodeFolder(root): OutputFolder`

The folder at `root` on disk, created when first written to. A symbolic link,
a folder, or a path whose folder leads outside `root` through a link is seen
as `other`, so it is never followed, read or replaced.

#### `memoryFolder(files?, options?): MemoryFolder`

A folder in memory for tests and previews. `options.others` lists paths that
behave like folders or links. `snapshot()` returns every file.

#### `digestOf(content): string`

`sha256:` and the hex SHA-256 of the UTF-8 bytes, as stored in the manifest.

### Changes

| Kind        | When                                                                  | Applying                   |
| ----------- | --------------------------------------------------------------------- | -------------------------- |
| `create`    | Wanted; no file on disk                                               | Writes the file            |
| `update`    | Wanted; the file is exactly what was generated last time              | Writes the new content     |
| `unchanged` | Wanted; the file already has the wanted content and was generated     | Nothing                    |
| `adopt`     | Wanted; the file already has the wanted content but was not generated | Records it as generated    |
| `delete`    | No longer wanted; the file is exactly what was generated              | Removes the file           |
| `forget`    | No longer wanted; the file is already gone                            | Drops it from the manifest |
| `conflict`  | See below                                                             | The plan cannot be applied |

### `Change`

`{ path, change, reason?, seen, diff? }`. `reason` is set on conflicts,
`diff` on updates, and `seen` is the digest of the file when planning
(or `absent` / `other`).

### Conflicts

| `reason`        | When                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| `EDITED`        | A generated file differs from what was generated (wanted or not)        |
| `NOT_GENERATED` | A wanted path holds a file that was never generated, with other content |
| `NOT_A_FILE`    | A folder or link is at the path                                         |

### Problems

| Code                 | Meaning                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `BAD_PATH`           | A wanted path breaks the path rules above                                                  |
| `BAD_MANIFEST`       | `.generated.json` is unreadable or lists a path outside the folder; no changes are planned |
| `PLAN_HAS_CONFLICTS` | `applyPlan` was given a plan that is not clean                                             |
| `LOCKED`             | Another generation holds `.generated.lock`                                                 |
| `CHANGED_SINCE_PLAN` | A file or the manifest changed between planning and applying                               |
| `WRITE_FAILED`       | Writing or removing failed; the message says whether every changed file was put back       |

Each problem is `{ code, path?, message }`; the message says what to do.

### `OutputFolder`

| Method                 | Contract                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `read(path): Entry`    | `{ kind: "file", content }`, `{ kind: "absent" }` or `{ kind: "other" }` |
| `write(path, content)` | Replaces the file in one step, creating folders as needed                |
| `remove(path)`         | Removes the file; may remove folders left empty                          |
| `lock(): boolean`      | Takes the lock; `false` when it is already held                          |
| `unlock()`             | Releases the lock                                                        |

### The manifest

`.generated.json` in the output folder:

```json
{
  "version": 1,
  "files": {
    "databricks.yml": "sha256:3f0a…"
  }
}
```

Paths are sorted, so the file changes only when generated files change.

## Documentation

User documentation: https://docs.ingestron.io. The language-neutral rules for this package are in
[spec/generate](https://github.com/ingestron/ingestron/tree/main/spec/generate).

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
