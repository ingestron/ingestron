# Private file share

Each store exports its sales and stock as CSV files to a share inside the
corporate network, `\\fs01\exports`, which the workspace cannot reach
(`connectivity: private`). The standard uses two packs,
`[databricks@1, adf@1]`. Databricks' `files` method cannot reach a private
source, so the ADF pack's rule chooses `adf-files`:

- **ADF** ([build/prod/adf](build/prod/adf/)), in the folder layout ADF
  keeps in Git:
  - a [file server linked service](build/prod/adf/linkedService/ls_stores_share.json)
    through the self-hosted integration runtime `shir-stores`, with the
    password from Key Vault;
  - a [pipeline](build/prod/adf/pipeline/pl_stores_share.json) with one
    binary copy per table: the files changed in the window, from
    `\\fs01\exports\sales` to `<landing>/sales/`, keeping their names and
    folders;
  - an hourly [tumbling window trigger](build/prod/adf/trigger/tr_stores_share.json),
    started in production and stopped elsewhere.
- **Databricks** ([build/prod/databricks](build/prod/databricks/)): streaming
  tables that read the landing folders with Auto Loader, as CSV with a
  header, typed by the contracts' columns.

The files are copied as they are, so the flow says their format
(`format: csv`). To copy every file each window instead of the changed ones,
set `mode: all`; to copy only some, set `files`, such as `"*.csv"`.

The integration runtime and Key Vault are shared infrastructure: they must
exist and are only referenced.
