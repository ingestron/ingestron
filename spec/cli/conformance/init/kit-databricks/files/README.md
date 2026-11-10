# sales

Streaming lakehouse on Databricks. Streaming tables that read each new file once, silver kept to the latest row per key with checks, and gold materialised views, retried and alerted on failure.
`ingestron init` wrote this file on 2026-11-10; it is yours, and Ingestron never rewrites it.
The standard comes from databricks/lakehouse-streaming@2026-11-10; STANDARD.md explains its choices.
The tables `customers`, `orders` and the contracts `contracts/customers.yaml`, `contracts/daily_sales.yaml`, `contracts/orders.yaml` are examples: rename the tables and change the contracts' columns to your source's.

## Run it

```sh
ingestron plan     # what would be generated, and what is still REPLACE_ME
ingestron apply    # writes the files under build/
```

## Values to replace before deploying

Ingestron cannot know these. `plan` warns about each; `ingestron check` fails until all are written.

| Name | File and line | What it is | Where to find it | Environments |
| --- | --- | --- | --- | --- |
| `landing` | `project.yaml:9`, `:15` | Where the shop's files land in dev: a volume, such as /Volumes/dev_sales/landing/shop | Catalog Explorer: the volume the files land in; its path is /Volumes/<catalog>/<schema>/<volume>. | dev, prod |
| `to` | `platform.yaml:12` | The address told when a run fails, such as data-team@example.com | Your team decides it: a shared mailbox or mailing list that the people who look after these pipelines read. | all |
| `host` | `project.yaml:7`, `:13` | The dev workspace's URL, such as https://adb-<workspace-id>.<n>.azuredatabricks.net | The address bar when you are signed in to the workspace; on Azure, also the workspace's URL field in the Azure portal. | dev, prod |
| `service_principal_name` | `platform.yaml:18` | Application ID of the service principal the pipelines and jobs run as | Settings, then Identity and access, then Manage next to Service principals: the service principal's application ID. | all |
| `group_name` | `platform.yaml:22`, `:25` | Group that manages the pipelines and jobs | Settings, then Identity and access, then Manage next to Groups: the group's name. | all |

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
