# Private SQL Server

The ERP of the sql-server starter, but now **unreachable** from the workspace
(`connectivity: private`). The standard uses two packs,
`[databricks@1, adf@1]`. Databricks' Lakeflow Connect rule is skipped
because it cannot reach a private source, and the ADF pack's rule chooses
`adf-copy`:

- **ADF** ([build/prod/adf](build/prod/adf/)), in the folder layout ADF
  keeps in Git:
  - a [SQL Server linked service](build/prod/adf/linkedService/ls_erp_erp_erp.json)
    through the self-hosted integration runtime `shir-erp`, with the password
    from Key Vault;
  - a [pipeline](build/prod/adf/pipeline/pl_erp_erp.json) with one copy per
    table, selecting only the contract's columns changed in the window, into
    `<landing>/erp.dbo.Customers/` as Parquet;
  - an hourly [tumbling window trigger](build/prod/adf/trigger/tr_erp_erp.json),
    started in production and stopped elsewhere.
- **Databricks** ([build/prod/databricks](build/prod/databricks/)): streaming
  tables over the same landing folders that keep the current row per key
  (`mode: upsert`), and the refresh job.

Each side runs on its own schedule; Auto Loader picks up new files whenever
the pipeline runs. The integration runtime and Key Vault are shared
infrastructure: they must exist and are only referenced.
