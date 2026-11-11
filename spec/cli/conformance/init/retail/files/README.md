# shop

Retail. A complete project: files into bronze, orders kept current from change records, and daily sales in silver.
`ingestron init` wrote this file on 2026-11-10; it is yours, and Ingestron never rewrites it.
The tables `orders`, `customers` and the contracts `contracts/customers.yaml`, `contracts/daily_sales.yaml`, `contracts/orders.yaml` are examples: rename the tables and change the contracts' columns to your source's.

## Run it

```sh
ingestron plan     # what would be generated, and what is still REPLACE_ME
ingestron apply    # writes the files under build/
```

## Values to replace before deploying

Ingestron cannot know these. `plan` warns about each; `ingestron check` fails until all are written.

| Name | File and line | What it is | Where to find it | Environments |
| --- | --- | --- | --- | --- |
| `storage_account` | `project.yaml:18`, `:24` | Storage account (ADLS Gen2) that the shop's files land in: its name | Azure portal: Storage accounts; the account's name | dev, prod |
| `on_failure` | `project.yaml:11` | Where pipeline failures are mailed | Your platform team | all |
| `host` | `project.yaml:16`, `:22` | The Databricks workspace URL, https://adb-<id>.<n>.azuredatabricks.net | Your platform team | dev, prod |
| `run_as` | `project.yaml:5` | Application ID of the service principal the pipelines and jobs run as | Your platform team | all |
| `engineers` | `project.yaml:7` | Group that manages the pipelines and jobs | Your platform team | all |
| `analysts` | `project.yaml:9` | Group that may view the pipelines and jobs | Your platform team | all |

Write each in place, or set it when creating a project with `ingestron init --set <name>=<value>`.
A value written once is used in every environment; to give one environment its own, write it in
`project.yaml` under `environments.<name>.values` and use it as `${values.<name>}`.

## Secrets to create

None: no connection here names a Key Vault secret.

## Deploy

### databricks: `build/databricks` (dev, prod)

One bundle with a target for each environment. For each environment, from the folder:

```sh
cd build/databricks
databricks bundle validate -t <environment>
databricks bundle deploy -t <environment>
```

The Databricks CLI deploys to the workspace it is signed in to, unless the platform's
`databricks.workspace.host` names one: sign in to each environment's workspace, or set it per
environment.

## Ask the platform team

`ingestron request --env prod > request-prod.md` writes what must exist before deploying, such as
the identities' access, as Markdown to send. It lists any value still `REPLACE_ME`.

## Values per environment

- `project.yaml`, `environments.<name>.values`: names, hosts and paths, reviewed in Git. Start here.
- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies, such as
  `BUNDLE_VAR_<name>`; `ingestron request` names each per platform. `.env.<environment>` (kept
  out of Git) sets it on your computer for DuckDB.
- `${secret:NAME}`: a Key Vault secret's name, never its value.
