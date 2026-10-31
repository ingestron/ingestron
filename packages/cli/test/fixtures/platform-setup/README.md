# Platform setup

`platform.yaml` holds what a platform team sets up for a project:

| Setting                                 | Generated in [prod](build/prod/)                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `workspace.host`, `run_as`              | [databricks.yml](build/prod/databricks.yml) target                                                                |
| `permissions`                           | the target's permissions, applied to every resource                                                               |
| `compute.budget_policy_id`, `tags`      | [the pipeline](build/prod/resources/hr.pipeline.yml)                                                              |
| `schedule`, `notifications`             | [the refresh job](build/prod/resources/hr_refresh.job.yml)                                                        |
| `manage.schemas: true`, `grants.bronze` | [schemas.yml](build/prod/resources/schemas.yml); the pipeline refers to its schema so the bundle creates it first |

Without `manage.schemas`, no schema is generated, because schemas are often
shared infrastructure that one project must not change.
