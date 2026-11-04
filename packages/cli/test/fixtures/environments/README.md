# Environments

One set of definitions, three environments. `project.yaml` gives values per
environment; the platform and connection read them.

One bundle, [build/databricks/databricks.yml](build/databricks/databricks.yml),
has a target for each; compare them:

|                                       | `dev`         | `test`         | `prod`         |
| ------------------------------------- | ------------- | -------------- | -------------- |
| Catalog (`finance_{{ environment }}`) | `finance_dev` | `finance_test` | `finance_prod` |
| Workspace                             | shared        | shared         | its own        |
| Landing path                          | `dev_landing` | `test_landing` | `prod_landing` |
| Bundle mode                           | development   | production     | production     |
| Daily refresh job                     | paused        | paused         | running        |

Every environment but `dev` deploys in production mode, so that names are not
prefixed and the deploy lock is on. The refresh job runs only in `prod` or
`production`. A platform can set `mode` and `schedule.paused` itself, from
values if they differ per environment.
