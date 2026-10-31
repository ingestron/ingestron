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
builds the files with the packs its standard names, such as the
[Databricks pack](https://github.com/ingestron/pack-databricks), and
writes them with [`@ingestron/generate`](../generate/README.md), into
`build/<environment>/`.

## In code

```ts
import { run } from "@ingestron/cli";

const code = run(["check"], {
  cwd: "definitions",
  write: (text) => process.stdout.write(text),
});
process.exitCode = code;
```

## Checking generated bundles

`pnpm check:bundle <schema.json>` checks the Databricks YAML generated for every
project template and test fixture against the output of `databricks bundle
schema`, from the Databricks CLI you deploy with.

## Documentation

User documentation: https://docs.ingestron.io. The language-neutral rules for this package are in
[spec/cli](https://github.com/ingestron/ingestron/tree/main/spec/cli).

## Licence

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
