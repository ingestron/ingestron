# Private file share

Each store exports its sales and stock as CSV files to a share inside the
corporate network, `\\fs01\exports`, which the workspace cannot reach
(`connectivity: private`). The standard uses two packs,
`[databricks@2, adf@2]`. Databricks' `files` method cannot reach a private
source, so the ADF pack's rule chooses `adf-files`:

- **ADF** ([build/adf](build/adf/)): one factory for both environments, in
  the folder layout ADF keeps in Git, with a parameter file per environment:
  - a [file server linked service](build/adf/factory/linkedService/ls_stores_share.json)
    through the self-hosted integration runtime `shir-stores`, with the
    password from Key Vault;
  - a [pipeline](build/adf/factory/pipeline/pl_stores_share.json) with one
    binary copy per table: the files changed in the window, from
    `\\fs01\exports\sales` to `<landing>/sales/`, keeping their names and
    folders;
  - an hourly [tumbling window trigger](build/adf/factory/trigger/tr_stores_share.json),
    started in production and stopped elsewhere;
  - [the values for prod](build/adf/parameters/prod.json): its landing
    storage, its Key Vault and the trigger's state.
- **Databricks** ([build/databricks](build/databricks/)): one bundle with a
  target per environment, whose streaming tables read the landing folders
  with Auto Loader, as CSV with a header, typed by the contracts' columns.

The files are copied as they are, so the flow says their format
(`format: csv`). To copy every file each window instead of the changed ones,
set `mode: all`; to copy only some, set `files`, such as `"*.csv"`.

The integration runtime and Key Vault are shared infrastructure: they must
exist and are only referenced.

`build/adf/factory/` is the factory's root folder: Microsoft's
`@microsoft/azure-data-factory-utilities` package builds one ARM template
from it, and each environment deploys that template with its own parameter
file, `build/adf/parameters/<env>.json`. Give the same file to the pre- and
post-deployment script as `-ArmTemplateParameters build/adf/parameters/<env>.json`;
without it, the script cannot read the trigger's state and does not start
production's trigger.
