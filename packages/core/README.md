# @ingestron/core

The Ingestron API, for tools built on Ingestron: load a project, plan, apply
and check its output, compare environments, write the platform request, and
create projects. The `ingestron` command and the editor extension are built on
it.

```sh
npm install @ingestron/core
```

```ts
import { builtInTemplates } from "@ingestron/core";

console.log(builtInTemplates().map((template) => template.name));
```

The documentation is at [docs.ingestron.io](https://docs.ingestron.io).

## Develop

```sh
pnpm install
pnpm --filter @ingestron/core validate
```
