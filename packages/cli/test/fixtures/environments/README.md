# Environments

One set of definitions, three environments. `project.yaml` gives values per
environment; the platform and connection read them.

Compare the three folders:

|                                       | [dev](build/dev/) | [test](build/test/) | [prod](build/prod/) |
| ------------------------------------- | ----------------- | ------------------- | ------------------- |
| Catalog (`finance_{{ environment }}`) | `finance_dev`     | `finance_test`      | `finance_prod`      |
| Workspace                             | shared            | shared              | its own             |
| Landing path                          | `dev_landing`     | `test_landing`      | `prod_landing`      |
| Bundle mode                           | development       | development         | production          |
| Daily refresh job                     | paused            | paused              | running             |

Mode and pause follow the environment's name by default (`prod` or
`production` is production); a platform can set `mode` and
`schedule.paused` itself, from values if they differ per environment.
