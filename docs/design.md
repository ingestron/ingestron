# Design: definitions to Databricks assets

Status: v1 design, 2026-10-24. Decisions: PD-177 (programme). Supersedes the
draft in the programme repository's `design/intentlabs/07`.

## Goal

Generate target assets (first: a Databricks bundle with a Lakeflow Spark
Declarative Pipeline) from reviewed definitions, following the
organisation's standards. Defaults must be smart, so a small project needs
almost no settings, and configurable, because naming, platform setup and
environments differ from case to case.

## Packages

| Package                      | Job                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `@ingestron/definitions`     | Schemas, loading (with `@ingestron/config`), method choice, naming, settings → a resolved model |
| `@ingestron/pack-databricks` | Databricks methods: builders and SQL templates that turn the resolved model into files          |
| `@ingestron/generate`        | Plans and applies generated files safely, keeping hand edits                                    |
| `@ingestron/cli`             | `ingestron plan`, `apply` and `check`, one output folder per environment                        |

## Documents

| Kind           | Written by    | Holds                                                                                                                                      |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| manifest       | project team  | `project.yaml`: id, values, environments, imports (`@ingestron/config`)                                                                    |
| `Standard`     | platform team | How things are done: methods per action, naming, layers, quality, types                                                                    |
| `Platform`     | project team  | Where things go for this project: workspace, mode, identity, compute, schedule, permissions; differs per environment through `${values.…}` |
| `Connection`   | project team  | A source                                                                                                                                   |
| `Flow`         | project team  | Tables moved from one connection                                                                                                           |
| `Transform`    | project team  | One table built from others with SQL                                                                                                       |
| `DataContract` | data owner    | ODCS v3.1.0, unchanged: columns, types, keys, descriptions                                                                                 |

`Standard` and `Platform` are separate on purpose: the same standard is used
by many projects, while each project's platform setup is its own.

## Settings: one resolution order

Every setting, including names, is resolved through the same layers. A later
layer wins, except `fixed`, which cannot be changed:

1. **Pack defaults:** the smart defaults, documented with each method.
2. **Standard:** `settings` per method, then the first matching `when` rule's
   `with`.
3. **Platform:** project and environment choices.
4. **Flow or Transform:** `with`, and per table.
5. **Standard `fixed`:** enforced; a lower layer that tries to change it is an
   error, not silently overridden.

`when` rules match facts only: `connectivity`, `connector`, `input` (what the
previous action hands over) and `layer`.

## Naming

Names come from patterns in the standard. A pattern is a Liquid template with
a fixed set of variables, so names are explicit and checkable:

```yaml
naming:
  catalog: "{{ environment }}" # pack default
  schema: "{{ layer }}" # pack default
  table: "{{ table }}" # pack default
  pipeline: "{{ project }}" # pack default
  job: "{{ project }}_refresh" # pack default
```

| Variable      | Value                                           |
| ------------- | ----------------------------------------------- |
| `project`     | Manifest id                                     |
| `environment` | Selected environment name                       |
| `layer`       | The object's layer, such as `bronze`            |
| `table`       | The table name (flow table key or transform id) |
| `flow`        | Flow id, for flow tables                        |
| `source`      | Connection id, for flow tables                  |

Every result must match `^[a-z_][a-z0-9_]*$` (patterns can use filters such
as `downcase`), and full table names must be unique; otherwise loading
reports `BAD_NAME` or `DUPLICATE_NAME`. A pattern that uses an unknown
variable is `BAD_PATTERN`, so a typo cannot quietly give a valid but wrong
name. Variables a table does not have are empty, so conditions work.
Examples of other conventions: one catalog with environment schemas
(`catalog: main`, `schema: "{{ environment }}_{{ layer }}"`), or
source-prefixed flow tables
(`table: "{% if source %}{{ source }}_{% endif %}{{ table }}"`).

Methods are declared in each pack's code, with a JSON Schema for their
settings, rather than as YAML documents: a pack is code anyway, because it
builds files.

## Layers

`layers: [bronze, silver, gold]` (pack default). Flow tables land in the first
layer. A transform lands in the second unless it says `layer: gold`. Layers
are facts for `when`, so per-layer choices (for example clustering or
retention properties for gold) are ordinary rules.

## Platform setup

| Setting          | Smart default                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `mode`           | `production` for environments named `prod` or `production`, else `development`              |
| `compute`        | `serverless`                                                                                |
| `schedule`       | none (refresh on demand); paused outside production                                         |
| `manage.schemas` | `false`: schemas usually belong to shared infrastructure; `true` generates them with grants |
| `run_as`         | none (deploying identity)                                                                   |

Shared resources are generated only when `manage` says so, so one product
never creates, changes or deletes another's schemas by default.

## Databricks output (per environment)

```
build/<environment>/
  databricks.yml                 bundle, one target named after the environment
  resources/<pipeline>.pipeline.yml
  resources/<job>.job.yml        when a schedule is set
  resources/schemas.yml          when manage.schemas is true
  src/<pipeline>/<layer>/<table>.sql
```

Every value is resolved at generation time; the bundle has no `variables`.
Tables are written with full names (`catalog.schema.table`), which the
default publishing mode supports in one pipeline.

Per table, from the standard, the contract and the definitions:

- **Ingestion from files:** a streaming table over
  `STREAM read_files(…)` (Auto Loader) with format, `schemaHints` from the
  contract's types and a schema evolution mode.
- **Change data:** with `mode: upsert` or `history`, a raw streaming table
  plus `AUTO CDC INTO` with the contract's primary key, `SEQUENCE BY` and
  `STORED AS SCD TYPE 1` or `2`.
- **Quality:** expectations from contract `required` columns and from
  explicit `expectations`; the standard chooses the action per kind
  (`warn`, `drop`, `fail`).
- **Physical layout:** `CLUSTER BY AUTO` by default, explicit columns or none;
  table properties; `COMMENT` from the contract description.
- **Transforms:** a materialised view over the user's SQL, with
  `{{ tables.<input> }}` replaced by full names.

## Not in v1

Ingestion that copies data from private sources (`adf-copy`, planned as a
separate ADF pack), managed connectors beyond SQL Server, Salesforce and
Kafka, PySpark transforms, row filters and column masks, per-flow pipelines,
and several workspaces per environment. Each needs its own verified slice.

## Several packs (added 2026-10-25)

A standard lists its packs, `packs: [databricks@1, adf@1]`. The first gives
the defaults; rules are joined in list order; a pack's rule only applies when
its method can read the source, so a private source falls through to the
bridge pack. Each step records its pack, and each pack builds files for its
own steps into `build/<env>/<pack>/`. Packs hand over through settings: the
copy step's `landing` folder is where the Databricks streaming table reads.
The ADF and Databricks sides run on their own schedules.

## Managed connectors (added 2026-10-25)

Connections gain `connectivity: workspace` (reachable over private
networking), so standards can tell it apart from `public` and from `private`
(unreachable, needs a bridge). `lakeflow-connect` writes tables itself: one
ingestion pipeline per connection, a gateway for databases, and the refresh
job runs ingestion before our pipeline. Credentials stay in Unity Catalog
connections; definitions only name them. Expectations now record whether
they came from the contract or the definitions, so the pack can refuse
definition checks that managed ingestion cannot run.

## Sources (accessed 2026-10-24)

- Databricks CLI v1.22.1 `databricks bundle schema` (pipeline, job, schema,
  target fields) and `databricks/bundle-examples` `lakeflow_pipelines_sql`.
- [CREATE STREAMING TABLE (pipelines)](https://docs.databricks.com/aws/en/ldp/developer/ldp-sql-ref-create-streaming-table.html),
  [AUTO CDC INTO](https://docs.databricks.com/aws/en/dlt-ref/dlt-sql-ref-apply-changes-into),
  [expectations](https://docs.databricks.com/aws/en/ldp/expectations),
  [read_files](https://docs.databricks.com/sql/language-manual/functions/read_files.html),
  [default publishing mode](https://docs.databricks.com/en/dlt/migrate-to-dpm).
