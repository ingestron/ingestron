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
  folders under `kits/`; a version is the git tag `<id>@<version>`. The
  environment variable `INGESTRON_STANDARDS_REPOSITORY` names another
  repository to use as the catalogue, such as a mirror or a `file://`
  repository; the default is `https://github.com/ingestron/standards.git`.
- **A git URL.** A team's private kit can be any repository: `<git-url>#<path>@<tag>`,
  where `<path>` is the kit's folder in the repository and `<tag>` the tag to
  read. It is never listed.

A kit spec, as the commands accept it, is one of:

- `<id>@<version>`: one version of a kit. The installed one when there is
  one; else the catalogue, cloned at the tag `<id>@<version>`, from which
  `kits/<id>/<version>` is read.
- `<id>`: the kit's newest version that is not a preview: the newest
  installed one, or, when none of the kit is installed, the newest in the
  catalogue's tags. Versions are ordered by date; on the same date the preview
  comes first, so the newest is the last. A preview version is used only
  when it is named.
- `<git-url>#<path>@<tag>`: a kit from a repository, cloned at `<tag>`. The
  path ends at the first `@` after the `#`, so a tag may itself contain `@`.
  The path must stay inside the repository.

A spec that is none of these is an error that shows the three forms.

A clone uses the user's own `git`: it is shallow, at one tag
(`git clone --depth 1 --branch <tag>`), runs no hooks and fetches no
submodules, and is removed when the command ends, whether it succeeds or not.
A URL is shown without the user name and password it may contain. Nothing
from a kit is run.

### Copying a kit

A kit's files are copied as they are, except:

- `kit.yaml`, which is not copied;
- `README.md`, which is copied as `STANDARD.md`;
- a file named `gitignore`, which is copied as `.gitignore`. npm does not ship
  a file named `.gitignore`, so a kit cannot hold one.

A kit holds only regular files and folders: a symbolic link is an error.

### Messages

A kit that breaks a rule above is reported with the spec in front of the
message `readKit` gives: `<id>@<version>: <message>`, or, for a git URL,
`<git-url>#<path>@<tag>: <message>`.

| When                                                  | Message                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| No such version, installed or in the catalogue's tags | `There is no version <version> of the kit <id>. It has: <versions>.`                                       |
| No version of the kit at all                          | `There is no kit <id>, installed or in the catalogue. Installed kits: <ids>.` (`none` when there are none) |
| `<id>` alone, and every version is a preview          | `The kit <id> has only preview versions: <versions>. Name one, such as <id>@<newest>.`                     |
| The catalogue cannot be read                          | `The kit <spec> is not installed, and the catalogue could not be read: <git's reason>`, `<spec>` as given  |
| The CLI's version is not in `requires.ingestron`      | `The kit <id>@<version> needs ingestron <range>; this is <version>.`                                       |

`<versions>` lists every version found, installed and in the catalogue's tags,
oldest first, joined by `, `.

## Commands

The cases above do not cover these. `init --kit` has cases of its own in
`conformance/init/` ([projects.md](projects.md), "Kits").

- `ingestron init --kit <spec>` creates a project from a kit. `--kit` and
  `--template` or `--standard` are exclusive. It refuses a kit whose
  `requires.ingestron` the CLI's version does not meet. With connection
  options, the kit gives the Standard and the route the source
  ([projects.md](projects.md), "Kits").
- `ingestron standard install <spec>` replaces the project's Standard
  document with the kit's, keeping its path and its `id`, and says what the kit's
  `notes` and Platform skeleton changed.
- `ingestron standard list [--platform <id>]` shows the installed kits and,
  online, the catalogue.
- `ingestron check` makes no network call and never says a newer kit exists.
