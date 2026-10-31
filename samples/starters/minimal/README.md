# Minimal

The standard only names the pack, so every choice is a pack default.

| Definition              | Becomes                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flows/orders.yaml`     | [a streaming table](build/dev/src/shop/bronze/orders.sql) reading new files once each                                                              |
| `contracts/orders.yaml` | `schemaHints` from the column types, `COMMENT`, and a not-null check on the required `id`                                                          |
| pack defaults           | catalog `dev` (the environment), schema `bronze` (the first layer), `CLUSTER BY AUTO`, parquet                                                     |
| `project.yaml`          | [a bundle](build/dev/databricks.yml) with one `dev` target in development mode, and [a serverless pipeline](build/dev/resources/shop.pipeline.yml) |
