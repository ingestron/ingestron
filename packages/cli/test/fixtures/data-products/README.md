# Define data products

The web shop's orders and customers are copied from Azure SQL by ADF, and
DuckDB builds the tables (`packs: [duckdb@1, adf@1]`), as in the DuckDB
example. On top, two **data products**, each an Open Data Product Standard
file in `products/`:

- `customers` publishes the customers table (contract `shop.customers`), owned
  by Mia Chen. Its name and email columns are classified `confidential`, and
  the contract says who may use them: `marketing-analysts`, for campaign
  reporting, approved by Mia.
- `sales` publishes `daily_sales`, built from orders and customers, owned by
  Sam Patel. It lists `customers` as an input.

The standard's `governance` section says what every product must give: an
owner and a purpose; a classification for every column it publishes, one of
four values; and, for a contract with confidential or restricted columns, the
roles that may use it, each with a purpose and an approver. `ingestron check`
fails until every product meets these, so a pull request that breaks one is
stopped. Remove `classification: confidential` from `email` to see it:

```text
contracts/customers.yaml:13:17  error  COLUMN_UNCLASSIFIED
  Column "email" of the contract "shop.customers" has no classification; "customers" publishes it, and the standard requires one.
```

`ingestron apply` writes, beside the pipelines, `build/<environment>/products/`:
a `README.md` listing the products, and a passport per product, `customers.md`
and `sales.md`. A passport says, in plain words, who owns the product and what
it is for, which table it is in this environment and where, its columns and
which are sensitive, its quality checks, how fresh it is, who may use it, its
lineage as a diagram, and the governance rules it meets. It is generated with
the pipelines, so it is always up to date.

The `local` environment runs the same tables on a laptop with DuckDB, from a
load's files in `./samples/`, and gets its own passports.
