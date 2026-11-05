# sales

SQL Server: ADF ingestion into Databricks. Data Factory copies the source's tables into landing storage, and Databricks keeps them as tables.
`ingestron init` wrote this file on 2026-11-04; it is yours, and Ingestron never rewrites it.
The table `sqlserver_records` and the contract `contracts/records.yaml` are examples: rename the tables and change the contracts' columns to your source's.

## Run it

```sh
ingestron plan     # what would be generated, and what is still REPLACE_ME
ingestron apply    # writes the files under build/
```

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
The storage account and Key Vault are written for each environment in `project.yaml`: where
environments differ, Data Factory takes them as parameters of the factory.

## Secrets to create

| Secret | In | Holds |
| --- | --- | --- |
| `sales-sqlserver-password` | each environment's `key_vault` | The login password; required for SQL or Windows authentication |

Azure portal: Key vaults, your vault, Objects, Secrets, + Generate/Import. Never write a secret in a file.

## Deploy

### adf: `build/adf` (dev, prod)

One factory for every environment, `build/adf/factory/`, and a parameter file for each,
`build/adf/parameters/<environment>.json`. Build the ARM template once with Microsoft's
export, from a `package.json` beside this README, on Node 20 or 22:

```json
{
  "scripts": { "build": "node node_modules/@microsoft/azure-data-factory-utilities/lib/index" },
  "dependencies": { "@microsoft/azure-data-factory-utilities": "1.0.3" }
}
```

```sh
npm install
npm run build export build/adf/factory <factory resource ID> arm
```

Then, for each environment, signed in to its subscription, in PowerShell:

```powershell
./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters build/adf/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $true -DeleteDeployment $false
az deployment group create --resource-group <group> --mode Incremental --template-file arm/ARMTemplateForFactory.json --parameters "@build/adf/parameters/<environment>.json" factoryName=<factory>
./arm/PrePostDeploymentScript.ps1 -ArmTemplate arm/ARMTemplateForFactory.json -ArmTemplateParameters build/adf/parameters/<environment>.json -ResourceGroupName <group> -DataFactoryName <factory> -PreDeployment $false -DeleteDeployment $true
```

`<factory resource ID>` is the dev factory's,
`/subscriptions/<subscription>/resourceGroups/<group>/providers/Microsoft.DataFactory/factories/<factory>`;
`<group>` and `<factory>` are each environment's resource group and data factory.
Where a deployment creates a self-hosted integration runtime, register a node with it before
the copies run. The full steps, with CI: https://docs.ingestron.io/docs/platforms/adf-deploy.

### databricks: `build/databricks` (dev, prod)

One bundle with a target for each environment. For each environment, from the folder:

```sh
cd build/databricks
databricks bundle validate -t <environment>
databricks bundle deploy -t <environment>
```

The Databricks CLI deploys to the workspace it is signed in to, unless the platform's
`workspace.host` names one: sign in to each environment's workspace, or set it per environment.

## Ask the platform team

`ingestron request --env prod > request-prod.md` writes what must exist before deploying, such as
the identities' access, as Markdown to send. It lists any value still `REPLACE_ME`.

## Values per environment

- `project.yaml`, `environments.<name>.values`: names, hosts and paths, reviewed in Git. Start here.
- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies;
  `ingestron request` names each per platform. Data Factory takes one only as a whole value, so
  keep the storage account and Key Vault in `project.yaml`.
- `${secret:NAME}`: a Key Vault secret's name, never its value.
