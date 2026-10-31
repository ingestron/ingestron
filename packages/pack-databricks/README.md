# @ingestron/pack-databricks

The Databricks pack: from resolved Ingestron definitions it generates a
[Declarative Automation Bundle](https://docs.databricks.com/aws/en/dev-tools/bundles/)
(formerly Databricks Asset Bundle) with one
[Lakeflow Spark Declarative Pipeline](https://docs.databricks.com/aws/en/ldp/concepts/)
per project. Name it in your standard: `packs: [databricks@1]`.

What it uses on Databricks:

- **Lakeflow Connect:** SQL Server (through an ingestion gateway), Salesforce
  and Kafka, through Unity Catalog connections; only the contract's columns,
  SCD type 1 or 2.
- **Ingestion with Auto Loader:** streaming tables over
  `STREAM read_files(…)`, with schema hints from the contract and a schema
  evolution mode.
- **Change data with AUTO CDC:** `mode: upsert` (SCD type 1) or
  `mode: history` (SCD type 2), keyed by the contract's primary key.
- **Expectations:** from required columns and your own checks, with
  `warn`, `drop` or `fail` per check.
- **Liquid clustering:** `CLUSTER BY AUTO` by default, or named columns.
- **Materialised views** for transforms, in SQL or PySpark.
- **Serverless pipelines**, a scheduled refresh job, Unity Catalog schemas
  and grants when you ask for them, permissions, tags and notifications.

Every value is resolved when generating, so the bundle has no variables.
Each environment gets its own bundle folder.

## Example

Most people use this through [`ingestron`](../cli/README.md). In code:

```ts
import { loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";

const result = loadDefinitions("samples/starters/retail", {
  packs: [databricks],
  environment: "dev",
});
if (result.model) {
  for (const path of Object.keys(databricks.build(result.model))) console.log(path);
}
```

For the retail example this prints:

```text
databricks.yml
resources/retail.pipeline.yml
src/retail/bronze/orders.sql
src/retail/bronze/customers.sql
src/retail/silver/daily_sales.sql
resources/retail_refresh.job.yml
```

The generated output of the example projects, including this one, is in
[examples/](../../examples/); a test fails when it is out of date.

## Documentation

User documentation lives in the [docs site](../../apps/docs/content/docs/index.mdx). Every method, setting and default is rendered there
from this package's code.

## Checks

`pnpm validate` runs the tests. The bundle-schema and template-parity checks
over every example are in the [CLI package](../cli/README.md), which knows all
packs.

Used with the [ADF pack](../pack-adf/README.md) (`packs: [databricks@1, adf@1]`),
streaming tables read the files `adf-copy` lands, from its `landing` folder.

## Dependencies

- [`@ingestron/definitions`](../definitions/README.md): the resolved model.
- [`liquidjs`](https://liquidjs.com/): renders the SQL templates in
  `templates/` and the transforms' SQL.
- [`yaml`](https://eemeli.org/yaml/): writes the bundle's YAML files.

## Sources (accessed 2026-10-24)

Bundle fields from Databricks CLI v1.22.1 `databricks bundle schema` and
`databricks/bundle-examples` (`lakeflow_pipelines_sql`). SQL from
[CREATE STREAMING TABLE](https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-create-streaming-table.html),
[CREATE MATERIALIZED VIEW](https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-create-materialized-view),
[AUTO CDC INTO](https://docs.databricks.com/aws/en/dlt-ref/dlt-sql-ref-apply-changes-into),
[expectations](https://docs.databricks.com/aws/en/ldp/expectations) and
[read_files](https://docs.databricks.com/sql/language-manual/functions/read_files.html),
[Python API](https://docs.databricks.com/aws/en/ldp/developer/python-ref),
[materialized_view](https://docs.databricks.com/aws/en/ldp/developer/ldp-python-ref-materialized-view),
[Python expectations](https://docs.databricks.com/aws/en/ldp/developer/ldp-python-ref-expectations),
[SQL Server ingestion](https://docs.databricks.com/gcp/ingestion/lakeflow-connect/sql-server-pipeline),
[Salesforce ingestion](https://docs.databricks.com/aws/ingestion/lakeflow-connect/salesforce-pipeline)
and [Kafka ingestion](https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/kafka-pipeline).
