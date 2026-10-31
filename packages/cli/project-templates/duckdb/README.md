# DuckDB on a laptop

Sample orders loaded into a local DuckDB database, a SQL transform over them,
and both tables published as Parquet: nothing to set up but the DuckDB command
line.

| File                              | What it shows                                          |
| --------------------------------- | ------------------------------------------------------ |
| `standard.yaml`                   | `packs: [duckdb@1]`, and CSV files                     |
| `platform.yaml`                   | `published`: the folder each table is published to     |
| `connections/shop.yaml`           | A files source in the project folder, `./samples`      |
| `flows/orders.yaml`               | `samples/orders.csv` becomes the table `bronze.orders` |
| `transforms/customer_totals.yaml` | SQL over the orders, kept as `silver.customer_totals`  |
| `contracts/*.yaml`                | ODCS contracts: the columns and their types            |

From the project folder:

```sh
ingestron apply
duckdb ingestron.duckdb < build/dev/run.sql
duckdb ingestron.duckdb "SELECT * FROM silver.customer_totals"
```

Running again is safe. Each run publishes `published/bronze.orders.parquet`
and `published/silver.customer_totals.parquet`, which Power BI and other tools
read as files.
