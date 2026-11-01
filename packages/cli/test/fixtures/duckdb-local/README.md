# Run locally with DuckDB

ADF copies the ERP's invoices into storage, and DuckDB loads them into a table,
runs a transform and publishes both as Parquet: `packs: [duckdb@1, adf@1]` in
`standard.yaml`. Each load copies the whole table into one file,
`erp/erp.dbo.Invoices/erp.dbo.Invoices.parquet`, replacing the last one
(`layout: snapshot`), so the table is always the latest load.

The `local` environment names `runs-on: duckdb`, so it runs the same tables on
a laptop: ADF's copy becomes `duckdb-landed`, which reads a load's files from
`./samples/<object>/`, and tables are published to the `./published` folder.

`ingestron apply` writes, for each environment under `build/<environment>/`:

- `adf/` (`dev` only): the copy pipeline, a parent pipeline that runs it and
  then the DuckDB job, the parent's trigger, linked services and datasets;
- `duckdb/run.sql`: every table in order, the same SQL in both environments
  apart from where the files are.

In `dev`, ADF's `after_copy` starts the Container Apps job `sales-dev-duckdb`
after each schedule's copies: the parent pipeline, `pl_sales_every_24_hour`,
runs the copies, starts the job and waits for it. The job runs
`ghcr.io/ingestron/duckdb-runner:1`, a public image, which reads the
`run.sql` your deploy step copies from `build/dev/duckdb/` to storage, rebuilds
every table from the landed files and publishes them. `ingestron request --env
dev` lists the job and the access it needs. `start` here is an example: when
you turn `after_copy` on, set it to the next window.

To run locally, download a load's file from `erp/erp.dbo.Invoices/` in the
`landing` file system to `samples/erp.dbo.Invoices/`. Then, from this folder:

```sh
duckdb -bail ingestron.duckdb -c ".read build/local/duckdb/run.sql"
```

Failures inside ADF (connectors, credentials, networking) only happen in ADF.
