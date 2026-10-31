# Ingestron

Declare data ingestion in reviewed YAML definitions, under your organisation's
standards, and generate the files your own platform runs: Databricks Asset
Bundles and Lakeflow pipelines, and Azure Data Factory copies. Ingestron runs
locally, never connects to your sources or your cloud, and never overwrites a
file someone edited by hand.

```sh
npx ingestron@1 init demo --template minimal --yes
cd demo
npx ingestron@1 plan    # what would be written, with diffs
npx ingestron@1 apply   # write it
```

In CI, `ingestron check` fails when the generated files are out of date.
Documentation: [docs.ingestron.io](https://docs.ingestron.io).

## This repository

The `ingestron` command and the libraries it is built from:

| Package                                           | Job                                                             |
| ------------------------------------------------- | --------------------------------------------------------------- |
| [`@ingestron/cli`](packages/cli/)                 | The `ingestron` command and its project templates               |
| [`@ingestron/definitions`](packages/definitions/) | Schemas, loading, resolving standards, and the pack interface   |
| [`@ingestron/generate`](packages/generate/)       | Plans and applies generated files safely, keeping hand edits    |
| [`@ingestron/config`](packages/config/)           | Multi-file YAML loading with references and environments        |
| [`@ingestron/authoring`](packages/authoring/)     | Editor features as plain functions: problems, fixes, completion |

Each package's public API is recorded in `packages/<name>/api/`; a change to it
is reviewed like any other. [`spec/`](spec/) holds the rules each package
follows, with language-neutral conformance cases.

The platform packs and the tools have their own repositories:

| Repository                                                                | Holds                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [ingestron/pack-databricks](https://github.com/ingestron/pack-databricks) | Databricks methods: SQL templates and bundle files               |
| [ingestron/pack-adf](https://github.com/ingestron/pack-adf)               | Azure Data Factory copies from sources the platform cannot reach |
| [ingestron/vscode](https://github.com/ingestron/vscode)                   | The VS Code extension                                            |
| [ingestron/docs](https://github.com/ingestron/docs)                       | The documentation site                                           |

## Working in this repository

```sh
pnpm install
pnpm validate   # format, licences, then lint, types, tests and API reports per package
```

Requires Node 22.13 or later and pnpm 10. How code is written here:
[CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## Contact

Questions and feedback: hello@ingestron.io. Security reports: security@ingestron.io
(see [SECURITY.md](SECURITY.md)). Privacy: privacy@ingestron.io.

## Licence

Licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE). Made by
[IntentLabs](https://intentlabs.dev).
