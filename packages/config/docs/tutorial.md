# Tutorial: a multi-file project

In this tutorial you build a small data project step by step. You start with
one file and end with shared files, environments, two kinds of document
and links between them. Each step adds one idea.

You need Node 22.13 or later and an empty folder:

```sh
mkdir sales && cd sales
pnpm init && pnpm add @ingestron/config && pnpm add -D tsx
```

## Step 1: one document

Create `definitions/project.yaml`, the **manifest**. It names the project and
says which files are documents:

```yaml
id: sales
imports:
  - "pipelines/*.pipeline.yaml"
```

Create `definitions/pipelines/orders.pipeline.yaml`. Every document starts
with `apiVersion`, `kind` and `id`:

```yaml
apiVersion: example.dev/v1
kind: Pipeline
id: orders
table: raw_orders
```

Create `load.ts`. `defineKind` tells the loader which documents to accept and
how to check them:

```ts
import { defineKind, formatDiagnostics, loadProject } from "@ingestron/config";

interface Pipeline {
  apiVersion: string;
  kind: "Pipeline";
  id: string;
  table: string;
}

const pipeline = defineKind<Pipeline>({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: {
    type: "object",
    required: ["apiVersion", "kind", "id", "table"],
    properties: { table: { type: "string" } },
  },
});

const result = loadProject("./definitions", {
  kinds: [pipeline],
  environment: process.argv[2],
});
if (!result.ok) {
  console.error(formatDiagnostics(result.diagnostics));
  process.exit(1);
}
for (const { value } of result.project.all(pipeline)) {
  console.log(JSON.stringify(value));
}
```

Run it:

```sh
npx tsx load.ts
```

```text
{"apiVersion":"example.dev/v1","kind":"Pipeline","id":"orders","table":"raw_orders"}
```

Now break something on purpose. Change `table: raw_orders` to `table: 42` and
run again:

```text
pipelines/orders.pipeline.yaml:4:8  error  SCHEMA
  /table must be string
```

Change it back before you continue.

## Step 2: share a value

Several documents often need the same value. Add `values` to the manifest:

```yaml
id: sales
values:
  catalog: main
imports:
  - "pipelines/*.pipeline.yaml"
```

Use it in the document with `${values.…}`:

```yaml
apiVersion: example.dev/v1
kind: Pipeline
id: orders
table: ${values.catalog}.sales.orders
```

```text
{"apiVersion":"example.dev/v1","kind":"Pipeline","id":"orders","table":"main.sales.orders"}
```

Mistype it as `${values.catalgo}` and the error lists what does exist:

```text
pipelines/orders.pipeline.yaml:4:8  error  UNKNOWN_VALUE
  "${values.catalgo}" has no value: "catalgo" is not defined.
  Available here: catalog.
```

## Step 3: environments

Development and production usually differ. Declare environments in the
manifest; each one can override values:

```yaml
id: sales
values:
  catalog: dev_catalog
environments:
  dev: {}
  prod:
    values:
      catalog: prod_catalog
imports:
  - "pipelines/*.pipeline.yaml"
```

Choose the environment when loading. `load.ts` passes the first command-line
argument as `environment`:

```sh
npx tsx load.ts prod
```

```text
{"apiVersion":"example.dev/v1","kind":"Pipeline","id":"orders","table":"prod_catalog.sales.orders"}
```

You can also use the environment's name: `table: raw_${environment.name}_orders`.

## Step 4: split a document across files

Column lists and queries are easier to manage in their own files. Create
`definitions/shared/columns.yaml`:

```yaml
orders:
  - name: order_id
    type: bigint
  - name: amount
    type: decimal(18,2)
```

and `definitions/sql/orders.sql`:

```sql
SELECT order_id, amount FROM ${source}.orders WHERE d = '{{ run_date }}'
```

Refer to them with `${file:…}`. Paths are relative to the file that contains
the reference:

```yaml
apiVersion: example.dev/v1
kind: Pipeline
id: orders
table: ${values.catalog}.sales.orders
columns: ${file:../shared/columns.yaml#/orders}
query: ${file:../sql/orders.sql}
```

- `#/orders` is a JSON Pointer: it picks the `orders` list out of the file.
  The result keeps its type, so `columns` is a list.
- The SQL file is inserted as text and is **never** interpolated. Its
  `${source}` and `{{ run_date }}` are left for the tool that runs the query.

Add `columns` and `query` to the schema's `properties` if you want them
checked.

## Step 5: a second kind, and a link

Pipelines read from connections. Add a Connection kind and a document for it.
`definitions/connections/erp.yaml`:

```yaml
apiVersion: example.dev/v1
kind: Connection
id: erp
host: erp.internal.example
password: ${secret:sales/erp-password}
```

Add the folder to the manifest's imports:

```yaml
imports:
  - "pipelines/*.pipeline.yaml"
  - "connections/*.yaml"
```

Give the pipeline a `source: erp` field, then declare the kind and the link in
`load.ts`:

```ts
import { defineKind, loadProject } from "@ingestron/config";

const connection = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Connection",
  schema: { type: "object", required: ["host", "password"] },
});

const pipeline = defineKind({
  apiVersion: "example.dev/v1",
  kind: "Pipeline",
  schema: { type: "object", required: ["table", "source"] },
  links: { "/source": "Connection" },
});

const result = loadProject("./definitions", { kinds: [connection, pipeline] });
console.log(result.ok);
```

Now `source: epr` (a typo) fails with `BROKEN_LINK`, which lists the
connection ids that exist. The secret is not read: `password` becomes
`{ "$secret": "sales/erp-password" }`, for the tool that deploys the project.

## Where next

- [How-to guides](how-to.md) set up editor validation and show how to write
  placeholders meant for generated files.
- The [examples](../examples/) contain each step as a runnable project.
- The [syntax reference](reference/syntax.md) lists every rule.
