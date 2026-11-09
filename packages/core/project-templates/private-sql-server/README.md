# Private SQL Server

The ERP of the sql-server starter, but now **unreachable** from the workspace
(`connectivity: private`). The standard uses two packs,
`[databricks@2, adf@2]`. Databricks' Lakeflow Connect rule is skipped
because it cannot reach a private source, and the ADF pack's rule chooses
`adf-copy`:

- **ADF** ([build/adf](build/adf/)): one factory for both environments, in
  the folder layout ADF keeps in Git, with a parameter file per environment:
  - a [SQL Server linked service](build/adf/factory/linkedService/ls_erp_erp_erp.json)
    through the self-hosted integration runtime `shir-erp`, with the password
    from Key Vault;
  - a [pipeline](build/adf/factory/pipeline/pl_erp_erp.json) with one copy per
    table, selecting only the contract's columns changed in the window, into
    `<landing>/erp.dbo.Customers/` as Parquet;
  - an hourly [tumbling window trigger](build/adf/factory/trigger/tr_erp_erp.json),
    started in production and stopped elsewhere.
- **Databricks** ([build/databricks](build/databricks/)): one bundle with a
  target per environment, whose streaming tables over the same landing
  folders keep the current row per key (`mode: upsert`), and the refresh job.

Each side runs on its own schedule; Auto Loader picks up new files whenever
the pipeline runs. The integration runtime and Key Vault are shared
infrastructure: they must exist and are only referenced.

`build/adf/factory/` is the factory's root folder: Microsoft's
`@microsoft/azure-data-factory-utilities` package builds one ARM template
from it, and each environment deploys that template with its own parameter
file, `build/adf/parameters/<env>.json`. Give the same file to the pre- and
post-deployment script as `-ArmTemplateParameters build/adf/parameters/<env>.json`;
without it, the script cannot read the trigger's state and does not start
production's trigger.
