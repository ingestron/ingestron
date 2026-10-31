# Quality

The standard sets `quality.required: drop` and `quality.default: warn`.
In [the generated table](build/dev/src/iot/bronze/readings.sql):

| Check                                    | From                             | Action                                         |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `sensor_id_not_null`, `read_at_not_null` | `required: true` in the contract | drop (standard)                                |
| `plausible_temperature`                  | the flow, no action              | warn (standard default): rows kept and counted |
| `known_unit`                             | the flow, `action: drop`         | drop                                           |
| `not_from_future`                        | the flow, `action: fail`         | the update stops                               |

The flow also reads CSV with a header and `;` delimiter through
`ingest.with.options`.
