# Output folders

Status: specified for CLI 2.0.0. CLI 1.x writes one output folder per
environment, `<out>/<environment>/` (section 7).

`plan`, `apply` and `check` write one output folder per pack, and each folder
covers every environment. A pack that builds environments together
(definitions specification, section 2.1) writes one artefact, such as one
Databricks bundle with a target per environment, which the deploying pipeline
promotes from environment to environment. The key words MUST, MUST NOT and
MAY are used as in RFC 2119.

## 1. Resolving every environment

The environments are those project.yaml declares, in its order, or the one
environment `default` when it declares none. Before anything is planned, each
environment is resolved, always with `environmentsTogether: true`
(definitions specification, section 7):

- **for deploy**, with `deployTime: true` (definitions specification, section
  1.1), when the standard names a pack that builds environments together.
  Each `${envvar:…}` is then a deploy-time value: it is not read from the host
  environment or an environment file, so an environment whose only unknown
  values are such references still resolves;
- **with the host's values**, with the host environment and the environment
  files, and `missingEnvvars: error`, when the environment is a target of a
  pack that does not build environments together, or the project has data
  products. With no pack that builds environments together, this is the only
  resolution, and it decides the targets.

Targets are as the definitions specification, section 2.1, defines them,
from the models resolved for deploy when there are any.

For each environment that has problems, the output is the line
`<environment>: the definitions have problems`, then the problems formatted
as the configuration package formats them. When the resolution for deploy
fails, its problems are shown and the environment is not resolved with the
host's values. For each environment that resolves with warnings or
information, the output is `<environment>: warnings`, then those diagnostics,
each shown once even when both resolutions found it.

When any environment has problems, nothing is planned or written, no output
folder is checked, and the exit code is 1: a bundle cannot be written with one
target missing.

## 2. Folders

`<out>` is the output folder, `build` unless `--out` names another. In the
standard's pack order:

- A pack that builds environments together has the output folder
  `<out>/<pack id>/`. Its files are what `buildEnvironments` returns for its
  targets.
- A pack that does not has the output folder `<out>/<pack id>/` too. For each
  target `<environment>`, the files that `build` returns are placed under
  `<environment>/` in it. So `<out>/duckdb/dev/run.sql` is DuckDB's `run.sql`
  for `dev`.
- A pack with no target has no output folder.
- When the project has data products, the passports (the
  [passport specification](passport.md)) have the output folder
  `<out>/products/`, with each environment's under `<environment>/`, for
  every environment. A pack MUST NOT have the id `products`.

Each output folder has one manifest and one lock, and is planned, applied and
checked as the generation specification says; nothing there changes. No
output folder is inside another. The layout is the same with one pack or
several, so adding a pack does not move another pack's files.

For example, a standard naming `databricks@2` and `adf@2`, with a `local`
environment that runs on `duckdb@1`:

```text
build/
  databricks/   .generated.json, databricks.yml, resources/, src/   (dev, test, prod)
  adf/          .generated.json, factory/, parameters/              (dev, test, prod)
  duckdb/       .generated.json, local/                             (local)
  products/     .generated.json, dev/, test/, prod/, local/
```

## 3. Building

Each pack that builds environments together is given the models of its
targets, resolved for deploy. When its result has problems, each is a
diagnostic as the definitions specification, section 2.1, says; the output is
the line `<pack id>: the definitions have problems`, then the diagnostics
formatted; nothing is planned or written; and the exit code is 1.

Each other pack's `build` is given the model of each of its targets, resolved
with the host's values.

## 4. plan, apply and check

Each output folder is planned in the order of section 2. For `plan` and
`apply`, each folder's block starts with the line

```text
<name> → <folder> (<targets>)
```

where `<name>` is the pack id, or `products`; `<folder>` is the output folder
relative to the working folder, with `/` between its parts; and `<targets>`
are the environments the folder covers, in project.yaml's order, joined with
`, `. For example `databricks → build/databricks (dev, test, prod)`. The plan
follows, as the generation package formats it. `apply` then writes each clean
folder as today, prints `Applied.` or its problems, and, when some folders
were written and others not, ends with
`Applied: <names>. Not applied: <names>.`

`check` prints, for each output folder, `<name>: up to date` or
`<name>: not up to date` followed by the plan; and for each file in the folder
that was not generated, `<name>: not generated  <path>`, then once
`Move files that were not generated out of the output folder, or check with --allow-extra.`,
unless `--allow-extra` is given. Files that Data Factory Studio writes into a
Git-connected factory's folder are such files.

**Retired folders.** After planning, each folder at or below `<out>` that holds
a manifest and is not one of the output folders is reported:

```text
<folder>: no longer generated. Delete the folder, or delete its .generated.json to keep it as your own.
```

with `<folder>` relative to the working folder. `check` fails while there is
one.

**Exit codes.** 0 when every folder is clean (`plan`), written (`apply`), or up
to date with nothing extra and no retired folder (`check`); 1 when an
environment or a pack has problems (sections 1 and 3), a folder is not clean,
or `check` finds a folder not up to date, a file not generated or a retired
folder; 2 for a usage mistake.

## 5. `--env`

`plan`, `apply` and `check` generate every environment together, so they do
not take `--env`. Given it, they write nothing and print the mistake, a blank
line and the usage, as for any usage mistake, with the exit code 2. The
mistake is:

```text
Every environment is generated together, so <command> does not take --env. Use compare or request for one environment.
```

`compare` and `request` keep `--env`, and `init` keeps it for the environments
it creates.

## 6. Deploy-time values

A `${envvar:…}` reference in a project whose standard names a pack that builds
environments together is, for that pack, a value the deploying pipeline
supplies (definitions specification, section 1.1). The files take it as a
parameter named by the pack's own rule, such as the bundle variable that the
Databricks CLI reads from `BUNDLE_VAR_<name>`, and no target sets it.
`plan`, `apply` and `check` give the same files on every computer, whether or
not the variable is set.

A pack that does not build environments together, and the passports, still
read the variable from the host environment and the environment files when
generating (section 1), as in CLI 1.x.

`request` lists these values with the names each pack's files take them as
([request specification](request.md), "Values to provide").

## 7. Upgrading from CLI 1.x

CLI 1.x wrote `<out>/<environment>/`, with each pack under
`<out>/<environment>/<pack id>/` when the standard named several, and the
passports under `<out>/<environment>/products/`. In 2.0 those folders are
retired folders (section 4): `apply` reports each, and `check` fails until
they are deleted. A standard that names version 1 of a pack whose version 2
builds environments together gets `PACK_VERSION`, with a fix
(definitions specification, section 1).

## 8. Conformance

Each case in [conformance/outputs/](conformance/outputs/) is a YAML file:

```yaml
description: What the case shows
files: # the project, path → text; paths under build/ are files already there
  project.yaml: |
    …
envvars: { NAME: value } # optional; the host environment
command: apply # plan, apply or check
args: [] # optional; more arguments, such as [--env, dev]
expect:
  exit: 0
  lines: # optional; lines the output has, in this order, others between them allowed
    - "fold → build/fold (dev, prod)"
  diagnostics: # optional; every diagnostic shown, in order, matched on the fields given
    - { code: ENVIRONMENTS_DIFFER, file: sales.yaml, line: 1 }
  folders: # optional; after the command, every folder under build/ with a manifest, and the files it lists
    build/fold: [tables.txt, targets.txt]
  texts: # optional; the text of some files after the command
    build/fold/targets.txt: "dev\nprod\n"
```

The command runs in the project's folder, with `--definitions .` and
`--out build`. The cases use the data-only packs of the definitions
conformance cases, all available. Each is given a stand-in build, so that the
cases test where files go, not what a real pack writes:

- `build(model)` gives one file, `tables.txt`: a line for each table of the
  model that has a step of the pack, in the model's order. The line is the
  table's name; for a table with an ingest step whose connection's
  `settings.path` is text, a space and that text follow.
- For a pack file with `buildEnvironments: true`, `buildEnvironments(models)`
  gives `tables.txt`, as `build` gives it for the first target, and
  `targets.txt`, a line for each target's name. Its `deployValues` give each
  of the first model's deploy-time values with `suppliedAs` `[FOLD_<name>]`.
  It has a problem `ENVIRONMENTS_DIFFER` for each table of the first target
  and each other target in which the table's methods of the pack, in the
  order ingest, transform, store, serve, are not the same:
  `Table "<name>" uses <methods> in <first> and <methods> in <other>.`, where
  `<methods>` are the method names quoted with `"` and joined with `, `, at
  the table's file.
