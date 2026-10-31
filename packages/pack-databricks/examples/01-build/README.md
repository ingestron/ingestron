# 01: Build

Builds the Databricks bundle of the [retail example](../../../../samples/starters/retail/)
for `dev` and lists the files, without writing them. The job file is there
because the platform has a schedule; there is no `schemas.yml` because the
platform does not manage schemas.

## Expected output

```text
databricks.yml
resources/retail.pipeline.yml
src/retail/bronze/orders.sql
src/retail/bronze/customers.sql
src/retail/silver/daily_sales.sql
resources/retail_refresh.job.yml
```
