# 02: Includes

Split a definition across files with `${file:…}`.

```
definitions/
  project.yaml
  pipelines/orders.pipeline.yaml   uses both kinds of include
  shared/columns.yaml              column lists shared by several pipelines
  sql/orders.sql                   the query, kept as a real SQL file
```

What to notice:

- `${file:../shared/columns.yaml#/orders}` inserts the value at `/orders`
  in another YAML file. The result keeps its type (here, a list), and
  `${values.key_type}` inside that file is resolved.
- Paths are relative to the file that contains the reference, and cannot
  leave the project folder.
- `${file:../sql/orders.sql}` inserts the file as text. Its contents are never
  interpolated, so `${source_catalog}` and `{{ run_date }}` reach the output
  unchanged, ready for the tool that runs the query.

## Expected output

```text
{
  "apiVersion": "example.dev/v1",
  "kind": "Pipeline",
  "id": "orders",
  "columns": [
    {
      "name": "order_id",
      "type": "bigint"
    },
    {
      "name": "amount",
      "type": "decimal(18,2)"
    }
  ],
  "query": "SELECT order_id, amount\nFROM ${source_catalog}.sales.orders\nWHERE order_date = '{{ run_date }}'\n"
}
```
