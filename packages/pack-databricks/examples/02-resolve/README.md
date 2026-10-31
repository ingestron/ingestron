# 02: Resolve

Loads the [retail example](../../../../samples/starters/retail/) for `prod` and
prints, for each table, its full name and the methods the standard chose.
The catalog `prod_sales` comes from the standard's naming pattern
`{{ environment }}_sales`; the mode is `production` because the environment
is called `prod`.

## Expected output

```text
prod_sales.bronze.orders: files → streaming-table (upsert)
prod_sales.bronze.customers: files → streaming-table (append)
prod_sales.silver.daily_sales: sql → materialised-view (view)
pipeline retail, mode production
```
