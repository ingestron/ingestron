# Ingestron

Declare data ingestion in reviewed YAML definitions, under your organisation's
standards, and generate the files your own platform runs: Databricks Asset
Bundles and Lakeflow pipelines, Azure Data Factory copies, Azure Synapse
serverless SQL views over the files they land, and DuckDB SQL that builds
tables on a laptop or in an Azure job ADF starts after each load. Ingestron
runs locally, never connects to your sources or your cloud, and never
overwrites a file someone edited by hand.

## Install

Requires Node.js 22.13 or later.

```sh
npm install -g ingestron
ingestron --help
```

If the shell then cannot find `ingestron`, npm's global folder is not on your
`PATH`: `npm prefix -g` prints it, and the command is in its `bin` folder
(on Windows, the folder itself).

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

## Source metadata and coding assistants

A contract can start from what a source says about its tables. `ingestron
source request` prints what to ask the source's owners for: who to ask, what
they run or call, and what they save. Ingestron has recipes for the common
kinds of source; any other source can be described with a sample of its data
or a columns file.
`ingestron source import` reads the file they send into
`sources/<connection>.yaml`, and `ingestron contract --from-metadata` drafts a
contract from it. Ingestron never connects to the source.

`ingestron init --assistant <names>` and `ingestron assistant add <names>`
write a project guide for coding assistants, `AGENTS.md`, from the project's
own files. `ingestron plan` reports when the guide's section would change, and
`ingestron apply` rewrites it.

## Learn more

- Documentation: https://docs.ingestron.io
- Recipes for each kind of source: https://docs.ingestron.io/docs/reference/recipes
- Source and issues: https://github.com/ingestron/ingestron

## Contact

Questions and feedback: hello@ingestron.io. Security reports:
security@ingestron.io. Privacy: privacy@ingestron.io.

## Licence

Apache License 2.0.
