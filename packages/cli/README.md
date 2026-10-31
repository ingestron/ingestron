# @ingestron/cli

The `ingestron` command: generates platform assets from definitions, as the
organisation's standard says, safely.

```sh
ingestron plan      # what would change in each environment's output, with diffs
ingestron apply     # write it; files edited by hand are never overwritten
ingestron check     # for CI: fail when the output is not up to date
ingestron schemas   # editor schemas for VS Code's YAML extension
```

It loads the definitions with [`@ingestron/definitions`](../definitions/README.md),
builds the files with the [Databricks pack](../pack-databricks/README.md) and
writes them with [`@ingestron/generate`](../generate/README.md), into
`build/<environment>/`.

## Documentation

User documentation lives in the [docs site](../../apps/docs/content/docs/index.mdx). Start with its first-project tutorial; a complete
project is in [samples/starters/retail](../../samples/starters/retail/).

## In code

```ts
import { run } from "@ingestron/cli";

const code = run(["check"], {
  cwd: "samples/starters/retail",
  write: (text) => process.stdout.write(text),
});
process.exitCode = code;
```

## Checks over every example

| Script                                     | Checks                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm check:bundle <schema.json>`          | Generated Databricks YAML against `databricks bundle schema` of the CLI you deploy with         |
| `PYTHON_LIQUID=<python> pnpm check:parity` | Every SQL file renders the same with python-liquid, so a Python version can share the templates |
