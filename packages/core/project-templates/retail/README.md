# Retail example

A complete project: web shop files brought into bronze, orders kept current
from change records, and a silver table of daily sales.

| File                          | What it shows                                                   |
| ----------------------------- | --------------------------------------------------------------- |
| `project.yaml`                | Values that differ between `dev` and `prod`                     |
| `standard.yaml`               | The organisation's catalog naming, quality and a fixed setting  |
| `platform.yaml`               | Tags, schedule, a failure alert, and the `databricks` section   |
| `connections/shop.yaml`       | A files source whose path differs per environment               |
| `flows/shop.yaml`             | Change data (`history: latest`), CSV options and an expectation |
| `transforms/daily_sales.yaml` | SQL in its own file, reading two flow tables                    |
| `contracts/*.yaml`            | ODCS contracts: types, keys and descriptions                    |

```sh
pnpm ingestron plan --definitions examples/08-retail --out examples/08-retail/build
```

The generated files are in [build/databricks](build/databricks/): one bundle
with a target for each environment.
For editor help, run `ingestron schemas` in this folder and add the printed
setting to VS Code.
