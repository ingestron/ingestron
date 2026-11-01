# Serve files as SQL

ADF copies the ERP's tables into storage, one file per table, and Synapse
serverless SQL shows them to reports as views: `packs: [synapse@1, adf@1]` and
`store: { default: synapse-view }` in `standard.yaml`. Synapse is listed first
even though ADF runs first: the first pack names and types the views; ADF only
copies.

`ingestron apply` writes, for each environment under `build/<environment>/`:

- `adf/`: the copy pipeline, its trigger, linked services and datasets;
- `synapse/views.sql`: a view per table over its file, `[bronze].[customers]`
  and `[bronze].[invoices]`, and `[silver].[customer_totals]` over the
  invoices view, from `transforms/customer_totals.yaml`.

Run `views.sql` against the serverless database `sales_<environment>` after
each change to the definitions; loads need nothing more. `ingestron request`
lists what the platform team creates: the database, a master key if it has
none, the external data source `landing` with its credential, Storage Blob Data
Reader on the landing storage for the Synapse workspace's managed identity, and
report users' access.
