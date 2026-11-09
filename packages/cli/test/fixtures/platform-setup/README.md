# Platform setup

`platform.yaml` holds what a platform team sets up for a project:

| Setting                                                       | Generated in [the bundle](build/databricks/)                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `databricks.workspace.host`, `databricks.run_as`              | [databricks.yml](build/databricks/databricks.yml)'s `prod` target                                                       |
| `databricks.permissions`                                      | the target's permissions, applied to every resource                                                                     |
| `databricks.compute.budget_policy_id`, `tags`                 | [the pipeline](build/databricks/resources/hr.pipeline.yml)                                                              |
| `schedule`, `alerts`                                          | [the refresh job](build/databricks/resources/hr_refresh.job.yml)                                                        |
| `databricks.manage.schemas: true`, `databricks.grants.bronze` | [schemas.yml](build/databricks/resources/schemas.yml); the pipeline refers to its schema so the bundle creates it first |

Without `databricks.manage.schemas`, no schema is generated, because schemas
are often shared infrastructure that one project must not change.
