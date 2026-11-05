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
(definitions specification, section 7). There are two ways:

- **for deploy**, with `deployTime: true` (definitions specification, section
  1.1). Each `${envvar:…}` is then a deploy-time value: it is not read from
  the host environment or an environment file, so an environment whose only
  unknown values are such references still resolves, and a computer without
  the deploying pipeline's values can plan;
- **with the host's values**, with the host environment and the environment
  files, and `missingEnvvars: error`, as in CLI 1.x.

When the standard names no pack that builds environments together, each
environment is resolved with the host's values only, and that model is used
for everything.

Otherwise an environment whose `runs-on` names a pack that does not build
environments together, such as DuckDB, is a **local environment**, known from
project.yaml before anything is resolved: it is resolved with the host's
values only, that model is used for everything, the passports included, and
that resolution's problems are the environment's. So a `${envvar:…}` set
nowhere is `ENVVAR_MISSING` there, as in CLI 1.x, and never `DEPLOY_VALUE`.

Every other environment is first resolved for deploy, and then:

1. When that resolves, and the environment is a target of a pack that builds
   environments together, it is a **deployed environment**. Its model resolved
   for deploy is given to those packs and to the passports. When it is also a
   target of a pack that does not build environments together, it is resolved
   with the host's values too, for that pack, and the problems of that
   resolution are the environment's too.
2. When that resolves, and the environment is a target of no pack that builds
   environments together, it is a local environment as well: it is resolved
   with the host's values, that model is used for everything, and when that
   resolution fails, its problems are the environment's.
3. When resolving for deploy fails, its problems are the environment's.

Targets are as the definitions specification, section 2.1, defines them,
from the model each step above uses.

Each diagnostic is shown once, under the environments that have it. Two
diagnostics are the same when their code, file, line and message are, so one
that both resolutions of an environment found, or that several environments
have, such as a problem in a file they share, is shown once. The diagnostics
are shown in groups, one for each set of environments that have the same
diagnostics: a group is the line `<environments>: the definitions have problems`
when any of its diagnostics is an error, else `<environments>: warnings`, then
its diagnostics formatted as the configuration package formats them.
`<environments>` are the environments that have each diagnostic of the group,
in project.yaml's order, joined with `, `. The groups are in the order of
their first diagnostic, taking the environments in project.yaml's order and
each environment's diagnostics in their order. For example, a standard that
names `databricks@1` in a project with `dev` and `prod` gives one
`PACK_VERSION`, under `dev, prod: the definitions have problems`.

When any environment has problems, nothing is planned or written, no output
folder is checked, and the exit code is 1: a bundle cannot be written with one
target missing.

In CLI 2.0, `compare`, `request` and the editor also resolve with
`environmentsTogether: true`, so they show the same `mode` as the generated
files.

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
environment that runs on `duckdb@2`:

```text
build/
  databricks/   .generated.json, databricks.yml, resources/, src/   (dev, test, prod)
  adf/          .generated.json, factory/, parameters/              (dev, test, prod)
  duckdb/       .generated.json, local/                             (local)
  products/     .generated.json, dev/, test/, prod/, local/
```

## 3. Building

Each pack that builds environments together is given the models of its
targets, resolved for deploy. Each problem in its result is a diagnostic as
the definitions specification, section 2.1, says. When one is an error, the
output is the line `<pack id>: the definitions have problems`, then the
diagnostics formatted; nothing is planned or written; and the exit code is 1.
Otherwise, when there are diagnostics, such as a `PACK_NOTICE`, the output is
the line `<pack id>: warnings`, then the diagnostics formatted, and the pack's
files are planned and written as usual.

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

**REPLACE_ME.** `plan`, `apply` and `check` resolve every environment as
section 1 says; `check` does so with `replaceMe: "error"` (definitions
specification, section 1), so a value still `REPLACE_ME` is an error there
and `check` fails, with nothing planned. In `plan` and `apply` it is a
warning, shown under the environments that have it, and the files are
generated with the text as written. After the plans, `plan` and `apply`
print, when the project has any,

```text
<n> values are still REPLACE_ME; ingestron check fails until each is written.
```

where `<n>` counts the places written, each once whatever environments have
it.

**Exit codes.** 0 when every folder is clean (`plan`), written (`apply`), or up
to date with nothing extra and no retired folder (`check`); 1 when an
environment or a pack has problems (sections 1 and 3), a folder is not clean,
or `check` finds a folder not up to date, a file not generated or a retired
folder; 2 for a usage mistake, or a pack that cannot be loaded.

**A pack that cannot be loaded.** Before any command reads a file, the CLI
checks its packs (definitions specification, section 7). When one is
refused, every command (`plan`, `apply`, `check`, `compare`, `request`,
`init`, `contract` and `schemas`) reads and writes nothing, prints the
`PACK_LOAD` error and exits with 2. The output is the error alone, with no
stack trace:

```text
(project)  error  PACK_LOAD
  The pack "<id>" lists the platform field "<path>", which the Platform document does not have.
  This is a mistake in the pack, not in the project, so nothing is checked or generated. Install a version of Ingestron, or of the editor extension, that fixes it.
```

`--help` and a usage mistake are answered first, as without the check.

## 5. `--env`

`plan`, `apply` and `check` generate every environment together, so they do
not take `--env`. Given it, they write nothing and print the mistake, a blank
line and the usage, as for any usage mistake, with the exit code 2. The
mistake is:

```text
Every environment is generated together, so <command> does not take --env. Use compare for two environments, or request for one.
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

In a deployed environment (section 1), the passports are built from the
model resolved for deploy, and show each deploy-time value as supplied when
deploying ([passport specification](passport.md)). A pack that does not build
environments together, and everything in a local environment, still read the
variable from the host environment and the environment files when
generating, as in CLI 1.x.

`request` lists these values with the names each pack's files take them as
([request specification](request.md), "Values to provide").

## 7. Upgrading from CLI 1.x

CLI 1.x wrote `<out>/<environment>/`, with each pack under
`<out>/<environment>/<pack id>/` when the standard named several, and the
passports under `<out>/<environment>/products/`. In 2.0 those folders are
retired folders (section 4): `apply` reports each, and `check` fails until
they are deleted. Every pack the CLI 2.0 uses is version 2, so a standard
that names version 1 of a pack gets `PACK_VERSION`, with a fix to version 2
(definitions specification, section 1).

## 8. Conformance

Each case in [conformance/outputs/](conformance/outputs/) is a YAML file:

```yaml
description: What the case shows
files: # the project, path → text; paths under build/ are files already there
  project.yaml: |
    …
envvars: { NAME: value } # optional; the host environment
notices: # optional; what the fold stand-in's buildEnvironments also gives
  - { message: "Text.", hint: "Text." }
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
  gives `tables.txt`, as `build` gives it for the first target but with each
  deploy-time value's text written as `$(FOLD_<name>)`, and `targets.txt`, a
  line for each target's name. Its `deployValues` give each deploy-time value
  of the models, in the order they first appear in target order, with
  `suppliedAs` `[FOLD_<name>]`. Its problems are the `structural` problems of
  `compareTargets(models)` (definitions specification, section 2.1), then, for
  each of the case's `notices`, a `PACK_NOTICE` with severity `warning`, that
  `message` and `hint`, and no `file`.
