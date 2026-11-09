# Kits: published, dated standards

A kit is a small, complete Ingestron project that someone has checked and
dated: a Standard, a Platform skeleton, a `project.yaml` and one connection,
flow, contract and transform that build. A kit is what a team starts from, and
what it later moves to when it wants a newer Standard. A kit adds no
definition kind. Everything in it is an ordinary definition with
`apiVersion: ingestron.io/v1`.

This page says what a kit folder holds, the rules `kit.yaml` must meet, and how
kits are found. The commands that use kits (`init --kit`, `standard install`,
`standard list`) are in the last section.

## The folder

```
<platform>/<name>/<version>/
  kit.yaml
  standard.yaml
  platform.yaml
  project.yaml
  README.md
  connections/  flows/  contracts/  transforms/
```

All four of `standard.yaml`, `platform.yaml`, `project.yaml` and `README.md` must
be regular files, with `kit.yaml`. The other folders are the project's own.
A kit never changes once published: a new version is a new folder.

## kit.yaml

```yaml
id: databricks/lakehouse-streaming
version: 2026-11-01 # or 2026-11-01-preview
title: Streaming lakehouse on Databricks
summary: Bronze streaming tables, silver SCD1 with checks, gold materialised views.
packs: [databricks@2]
features: ga # preview when the version ends -preview
requires: { ingestron: ">=2.4.0" }
maintainers: [ingestron]
replaces: null # the previous version of this kit
notes: |
  What changed from `replaces`, in plain words.
```

`id`, `version`, `title`, `summary`, `packs`, `features` and `requires` are
required. `maintainers` (default `[]`), `replaces` (default `null`) and `notes`
(default empty) are optional. Any other key is an error, so a typo is found at
once. `version` and `replaces` are text (`2026-11-01`), never a YAML date.

## Rules

Each rule has a conformance case in `conformance/kits/cases.json` with the exact
message. `readKit` checks them in this order and stops at the first that is
broken.

1. `kit.yaml` exists, is a regular file, is valid YAML and is a mapping.
2. No key other than those above, and none missing from the required ones.
3. `title`, `summary` and `notes` are text; `packs` and `maintainers` are lists
   of text; `requires` holds `ingestron` only.
4. `packs` is not empty, and each entry is a pack id and its major version:
   `<id>@<major>`, such as `databricks@2`.
5. `id` is `<platform>/<name>`: two lower-case words, digits allowed, joined
   inside a word by `-`. `<platform>` is the id of the first pack.
6. `version` is `YYYY-MM-DD`, or `YYYY-MM-DD-preview`, and the date is a real
   one.
7. `features` is `ga` or `preview`, and is `preview` exactly when `version`
   ends `-preview`.
8. `requires.ingestron` is a version range of one of three forms: `>=X.Y.Z`,
   `^X.Y.Z` or `~X.Y.Z`. (A small check of these forms, not the whole of
   semver: no `||`, no spaces, no `x` ranges, no pre-release.) `>=` allows that
   version and every later one; `^` allows later versions that keep the
   leftmost non-zero part (`^2.4.0` is at least 2.4.0 and below 3.0.0, `^0.4.0`
   is at least 0.4.0 and below 0.5.0); `~` allows later patch versions
   (`~2.4.0` is at least 2.4.0 and below 2.5.0).
9. `replaces` is `null` or a valid version, earlier than `version`. Versions
   are ordered by date; on the same date the preview comes first.
10. `standard.yaml`, `platform.yaml`, `project.yaml` and `README.md` exist as
    regular files.
11. `standard.yaml` is valid YAML and a mapping, and its `packs` equals the
    kit's `packs`, in the same order.
12. `standard.yaml` has `origin: { standard: <id>, version: <version> }`,
    the kit's own id and version. It is documentation: nothing reads it except
    `standard install`, to name the old version.

When the folder sits under a catalogue root (`installedKits`), one more rule
holds: its path below the root is `<id>/<version>`. A folder read on its own,
as from a git URL, is checked on its contents only.

## Where kits are found

- **Installed.** `@ingestron/standards` holds Ingestron's own kits in its
  `kits` folder, laid out as above. They work offline. When that package is not
  installed, there are none.
- **The catalogue.** The public `ingestron/standards` repository holds the same
  folders under `kits/`; a version is the git tag `<id>@<version>`.
- **A git URL.** A team's private kit can be any repository: `<git-url>#<path>@<tag>`,
  where `<path>` is the kit's folder in the repository and `<tag>` the tag to
  read. It is never listed.

A kit spec, as the commands accept it, is one of:

- `<id>@<version>`: one version of a kit.
- `<id>`: the kit's newest installed version. Versions are ordered by date; on
  the same date the preview comes first, so the newest is the last.
- `<git-url>#<path>@<tag>`: a kit from a repository. The path ends at the first
  `@` after the `#`, so a tag may itself contain `@`.

A spec that is none of these is an error that shows the three forms.

## Commands

These are specified here and built in later steps; the cases above do not
cover them.

- `ingestron init --kit <spec>` creates a project from a kit. `--kit` and
  `--template` or `--standard` are exclusive. It refuses a kit whose
  `requires.ingestron` the CLI's version does not meet.
- `ingestron standard install <spec>` replaces the project's Standard
  document with the kit's, keeping its path and its `id`, and says what the kit's
  `notes` and Platform skeleton changed.
- `ingestron standard list [--platform <id>]` shows the installed kits and,
  online, the catalogue.
- `ingestron check` makes no network call and never says a newer kit exists.
