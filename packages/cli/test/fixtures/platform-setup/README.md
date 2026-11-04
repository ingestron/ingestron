# Platform setup

`platform.yaml` holds what a platform team sets up for a project:

| Setting                                 | Generated in [the bundle](build/databricks/)                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `workspace.host`, `run_as`              | [databricks.yml](build/databricks/databricks.yml)'s `prod` target                                                       |
| `permissions`                           | the target's permissions, applied to every resource                                                                     |
| `compute.budget_policy_id`, `tags`      | [the pipeline](build/databricks/resources/hr.pipeline.yml)                                                              |
| `schedule`, `notifications`             | [the refresh job](build/databricks/resources/hr_refresh.job.yml)                                                        |
| `manage.schemas: true`, `grants.bronze` | [schemas.yml](build/databricks/resources/schemas.yml); the pipeline refers to its schema so the bundle creates it first |

Without `manage.schemas`, no schema is generated, because schemas are often
shared infrastructure that one project must not change.
