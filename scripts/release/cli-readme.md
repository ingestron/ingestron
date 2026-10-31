# Ingestron

Declare data ingestion in reviewed YAML definitions, under your organisation's
standards, and generate the files your own platform runs: Databricks Asset
Bundles and Lakeflow pipelines, Azure Data Factory copies, Azure Synapse
serverless SQL views over the files they land, and DuckDB SQL that builds
tables on a laptop. Ingestron runs locally, never connects to your sources or
your cloud, and never overwrites a file someone edited by hand.

## Install

Requires Node.js 22.13 or later.

```sh
npm install -g ingestron
ingestron --help
```

Or run it without installing: `npx ingestron@1 --help`.

## Quick start

```sh
ingestron init demo --template minimal --yes
cd demo
ingestron plan    # what would be written, with diffs
ingestron apply   # write it
```

Commit the definitions and the generated `build/` folder, then deploy the
output with your own pipeline. In CI, `ingestron check` fails when the
generated files are out of date.

## Learn more

- Documentation: https://docs.ingestron.io
- Source and issues: https://github.com/ingestron/ingestron

## Contact

Questions and feedback: hello@ingestron.io. Security reports:
security@ingestron.io. Privacy: privacy@ingestron.io.

## Licence

Apache License 2.0. Made by IntentLabs.
