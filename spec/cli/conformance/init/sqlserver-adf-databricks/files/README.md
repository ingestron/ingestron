# sales

SQL Server: ADF ingestion into Databricks. Data Factory copies the source's tables into landing storage, and Databricks keeps them as tables.
`ingestron init` wrote this file on 2026-11-04; it is yours, and Ingestron never rewrites it.
The table `sqlserver_records` and the contract `contracts/records.yaml` are examples: rename the tables and change the contracts' columns to your source's.

## Run it

    ingestron plan     # what would be generated, and what is still REPLACE_ME
    ingestron apply    # writes the files under build/

## Values to replace before deploying

Ingestron cannot know these. `plan` warns about each; `ingestron check` fails until all are written.

| Name | File and line | What it is | Where to find it | Environments |
| --- | --- | --- | --- | --- |
| `source_server` | `connections/sqlserver.yaml:8` | The host name the integration runtime reaches | The source's own tools; see the connector's documentation: https://learn.microsoft.com/en-us/azure/data-factory/connector-sql-server | all |
| `source_user` | `connections/sqlserver.yaml:10` | The login; required for SQL or Windows authentication | The source's own tools; see the connector's documentation: https://learn.microsoft.com/en-us/azure/data-factory/connector-sql-server | all |
| `sqlserver_records_object` | `flows/sqlserver.yaml:10` | The source object: database.schema.table | The source's own tools; see the connector's documentation: https://learn.microsoft.com/en-us/azure/data-factory/connector-sql-server | all |
| `storage_account` | `project.yaml:7`, `:13` | Storage account (ADLS Gen2) that the landing folder is in: its name | Azure portal: Storage accounts; the account's name | dev, prod |
| `key_vault` | `project.yaml:9`, `:15` | Key Vault that holds the source's secrets: its name, not its URL | Azure portal: Key vaults; the vault's name | dev, prod |
| `integration_runtime` | `platform.yaml:10` | Name of the integration runtime that reaches the source | Your platform team | all |

Write each in place, or set it when creating a project with `ingestron init --set <name>=<value>`.
A value written once is used in every environment; to give one environment its own, write it in
`project.yaml` under `environments.<name>.values` and use it as `${values.<name>}`.

## Secrets to create

| Secret | In | Holds |
| --- | --- | --- |
| `sales-sqlserver-password` | each environment's `key_vault` | The login password; required for SQL or Windows authentication |

Azure portal: Key vaults, your vault, Secrets, Generate/Import. Never write a secret in a file.

## Deploy

### databricks: `build/databricks` (dev, prod)

One bundle with a target for each environment. From the folder, for each environment:

    cd build/databricks
    databricks bundle validate -t prod
    databricks bundle deploy -t prod

### adf: `build/adf` (dev, prod)

One factory for every environment, `build/adf/factory/`, and a parameter file for each,
`build/adf/parameters/<environment>.json`. Build the ARM template once with Microsoft's
`@microsoft/azure-data-factory-utilities`:

    npm run build export build/adf/factory <factory resource ID> arm

Then, for each environment: the pre-deployment script, the deployment and the
post-deployment script, each given that environment's parameter file:

    ./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters build/adf/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $true -DeleteDeployment $false
    az deployment group create --resource-group <group> --mode Incremental --template-file arm/ARMTemplateForFactory.json --parameters @build/adf/parameters/<environment>.json factoryName=<factory>
    ./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters build/adf/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $false -DeleteDeployment $true

## Ask the platform team

`ingestron request --env prod > request-prod.md` writes what must exist before deploying, such as
the identities' access, as Markdown to send. It lists any value still `REPLACE_ME`.

## Values per environment

- `project.yaml`, `environments.<name>.values`: names, hosts and paths, reviewed in Git. Start here.
- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies, such as
  `BUNDLE_VAR_<name>`; `ingestron request` names each per platform. `.env.<environment>` (kept
  out of Git) sets it on your computer for DuckDB.
- `${secret:NAME}`: a Key Vault secret's name, never its value.
