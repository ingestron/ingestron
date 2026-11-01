# Run locally with DuckDB

ADF copies the ERP's invoices into storage, and DuckDB loads them into a table,
runs a transform and publishes both as Parquet: `packs: [duckdb@1, adf@1]` in
`standard.yaml`.

The `local` environment names `runs-on: duckdb`, so it runs the same tables on
a laptop: ADF's copy becomes `duckdb-landed`, which reads a load's files from
`./samples/<object>/`, and tables are published to the `./published` folder.

`ingestron apply` writes, for each environment under `build/<environment>/`:

- `adf/`: the copy pipeline, its trigger, linked services and datasets (`dev`);
- `duckdb/run.sql`: every table in order, the same SQL in both environments
  apart from where the files are.

In `dev`, ADF's `after_copy` starts the Container Apps job `sales-dev-duckdb`
after each schedule's copies: one parent pipeline, `pl_sales_every_24_hour`,
runs the copies, starts the job and waits for it. The job runs
`ghcr.io/ingestron/duckdb-runner:1`, a public image, which rebuilds every table
from the landed files and publishes it. `ingestron request --env dev` lists the
job and the access it needs.

To run locally, put a load's files in `samples/erp.dbo.Invoices/`: ADF writes
them to `erp/erp.dbo.Invoices/` in the `landing` file system, one Parquet file
per load, so download that folder's files. Then, from this folder:

```sh
duckdb ingestron.duckdb < build/local/duckdb/run.sql
```

Failures inside ADF (connectors, credentials, networking) only happen in ADF.
