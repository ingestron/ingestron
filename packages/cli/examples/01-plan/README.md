# 01: Plan

Runs `ingestron plan` for `prod` on the [retail example](../../../../samples/starters/retail/)
from an empty folder, so every file is a `create`. Nothing is written.

## Expected output

```text
prod → build/prod
create    databricks.yml
create    resources/retail.pipeline.yml
create    resources/retail_refresh.job.yml
create    src/retail/bronze/customers.sql
create    src/retail/bronze/orders.sql
create    src/retail/silver/daily_sales.sql

6 files: 6 create. Ready to apply.
```
