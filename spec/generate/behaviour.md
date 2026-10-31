# Generation: specification

Version: 1 (draft). Status: implemented by `@ingestron/generate` (TypeScript).
Other implementations must pass the same [conformance cases](conformance/).

This document is for people **implementing** the behaviour. People **using**
it should start with the package [README](../../packages/generate/README.md).

The key words MUST, MUST NOT and MAY are used as in RFC 2119.

## 1. Terms

- **Output folder:** the folder a generator owns part of. Everything is
  relative to it.
- **Wanted files:** what the generator wants the output folder to contain this
  time: a map from path to text content.
- **Manifest:** the file `.generated.json` in the output folder. It records
  every file the generator wrote last time, with the SHA-256 digest of the
  content it wrote:

  ```json
  { "version": 1, "files": { "jobs/orders.yaml": "sha256:9f86…" } }
  ```

  Paths are sorted. A missing manifest means nothing was generated yet.

- **Digest:** `sha256:` followed by the lowercase hex SHA-256 of the UTF-8
  bytes of the content.

## 2. Paths

A wanted path MUST be relative, use `/` as separator, and contain no empty,
`.` or `..` segment, no `\`, no `:` and no NUL. It MUST NOT be the manifest
or lock file, or lie inside a folder named `.git`. Two wanted paths MUST NOT
differ only in letter case, because they would clash on case-insensitive file
systems. A path that breaks these rules is a `BAD_PATH` problem.

## 3. Planning

Planning compares, for every path that is wanted or listed in the manifest,
three things: the wanted content, the manifest digest, and the content now on
disk. It never writes. Each path gets exactly one change:

| Wanted | In manifest | On disk                  | Change      | Meaning                                    |
| ------ | ----------- | ------------------------ | ----------- | ------------------------------------------ |
| yes    | no          | absent                   | `create`    |                                            |
| yes    | no          | equal to wanted          | `adopt`     | Same content already there; take ownership |
| yes    | no          | different                | `conflict`  | `NOT_GENERATED`: someone else's file       |
| yes    | yes         | absent                   | `create`    | Deleted by hand; written again             |
| yes    | yes         | equal to wanted          | `unchanged` |                                            |
| yes    | yes         | equal to manifest digest | `update`    | Unedited since generated                   |
| yes    | yes         | different from both      | `conflict`  | `EDITED`: changed by hand                  |
| no     | yes         | absent                   | `forget`    | Already gone; drop from the manifest       |
| no     | yes         | equal to manifest digest | `delete`    | No longer wanted and unedited              |
| no     | yes         | different                | `conflict`  | `EDITED`: changed by hand, not deleted     |

"Equal to wanted" is checked before "equal to manifest digest". Changes are
listed in path order. A path that is a folder or a symbolic link on disk is a
`conflict` with reason `NOT_A_FILE`.

A plan is **clean** when it has no conflicts and no `BAD_PATH` problems. A
plan is **up to date** when every change is `unchanged`; this is the check
for continuous integration.

Each `update` change carries a line diff of the old and new content. Each
change records the digest of the content seen on disk (or none), so applying
can detect that the folder changed after planning.

## 4. Applying

Applying a plan MUST:

1. Refuse a plan that is not clean (`PLAN_HAS_CONFLICTS`).
2. Create the lock file `.generated.lock` exclusively, and refuse when it
   already exists (`LOCKED`). The lock is removed when applying ends, whether
   or not it succeeded.
3. Check that every path still has the disk digest recorded in the plan, and
   refuse otherwise (`CHANGED_SINCE_PLAN`), before changing anything.
4. Write each `create`, `update` file through a temporary file in the same
   folder followed by a rename, remove each `delete` file, and finally write
   the manifest the same way. The new manifest lists exactly the wanted
   files.
5. If any step fails, restore every file it changed to its previous content
   and leave the manifest unchanged, then report the failure. If a file
   cannot be restored, keep restoring the others and say in the report that
   some files could not be put back.

Folders that a write needs are created one level at a time from the output
folder. When a level already exists as a symbolic link or a file, the write
fails before any folder is created, so nothing is made outside the output
folder.

Restoring covers one output folder and failures the writer observes. It is
not crash-safe: if the process stops between steps, the folder can hold a mix
of old and new files and the lock file remains.

`unchanged`, `adopt` and `forget` change no file, but are reflected in the
new manifest. Empty folders left by a delete MAY be removed.

## 5. Conformance

Each file in [conformance/](conformance/) is one case:

```yaml
description: What the case shows
disk: # the output folder before planning, path → content
  jobs/orders.yaml: "name: orders\n"
manifest: # optional; path → content that was generated (digests are derived)
  jobs/orders.yaml: "name: orders\n"
wanted: # path → content
  jobs/orders.yaml: "name: orders_v2\n"
expect:
  changes: # optional; in path order; `reason` only on conflicts
    - { path: jobs/orders.yaml, change: update }
  problems: # optional; in path order
    - { code: BAD_PATH, path: ../outside.yaml }
  clean: true
  upToDate: false
  disk: # optional; the folder after applying (only for clean plans)
    jobs/orders.yaml: "name: orders_v2\n"
```
