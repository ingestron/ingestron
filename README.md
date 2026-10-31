# Ingestron

Generates data platform assets from reviewed definitions, as the
organisation's standards say. First target: a Databricks bundle with a
Lakeflow Spark Declarative Pipeline per project and environment.

```sh
ingestron plan     # what would change in build/<environment>, with diffs
ingestron apply    # write it; hand-edited files are never overwritten
ingestron check    # for CI: fail when build/ is not up to date
```

| Package                                                   | Job                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| [`@ingestron/cli`](packages/cli/)                         | The `ingestron` command                                          |
| [`@ingestron/definitions`](packages/definitions/)         | Schemas, loading, and resolving standards into a model           |
| [`@ingestron/pack-databricks`](packages/pack-databricks/) | Databricks methods: SQL templates and bundle files               |
| [`@ingestron/pack-adf`](packages/pack-adf/)               | Azure Data Factory copies from sources the platform cannot reach |
| [`@ingestron/generate`](packages/generate/)               | Plans and applies generated files safely, keeping hand edits     |
| [`@ingestron/config`](packages/config/)                   | Multi-file YAML loading with references and environments         |
| [`@ingestron/authoring`](packages/authoring/)             | Editor features as plain functions: problems, fixes, completion  |

Also here:

- [`apps/docs/`](apps/docs/): the documentation site, the only home for user
  documentation. `pnpm --filter @ingestron/docs dev` serves it locally.
- [`samples/`](samples/): projects users read and start from, each with the
  files generated from it committed. `samples/starters/<name>` are complete
  projects that `ingestron init --template <name>` and VS Code's New project
  start from (each has `template.yaml`); `samples/guides/<name>` each show one
  idea and are embedded in the docs (each has `sample.yaml`). What each uses
  is found by resolving it. `pnpm examples` regenerates the outputs; a test
  keeps them current. Package API examples stay in `packages/*/examples/`.
- [`docs/design.md`](docs/design.md): why it works this way.
- [`spec/`](spec/): the rules every implementation follows, with
  language-neutral conformance cases, so a Python version can match.

## Working in this repository

```sh
pnpm install
pnpm validate   # format, then lint, types, tests, examples and docs per package
```

Requires Node 22.13 or later and pnpm 10. How code and documentation are
written here: [CONTRIBUTING.md](CONTRIBUTING.md). Releasing and recovery:
[docs/runbook.md](docs/runbook.md). Security: [SECURITY.md](SECURITY.md).

## Contact

Questions and feedback: hello@ingestron.io. Security reports: security@ingestron.io
(see [SECURITY.md](SECURITY.md)). Privacy: privacy@ingestron.io.

## Licence

Licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE). Made by
[IntentLabs](https://intentlabs.dev).
