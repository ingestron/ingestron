# 04: Custom kinds

A project with two kinds of document, each with its own schema file.

```
definitions/
  project.yaml
  connections/erp.yaml          kind: Connection
  pipelines/orders.yaml         kind: Pipeline
schemas/
  connection.schema.yaml        JSON Schema, written in YAML
  pipeline.schema.yaml
```

What to notice:

- A kind is identified by `apiVersion` plus `kind`. A document whose pair is
  not registered is refused (`UNKNOWN_KIND`).
- Schemas are plain JSON Schema (draft 2020-12) files. The same files can drive
  editor validation (example 07) and a future Python implementation.
- The schema checks the document **after** references are resolved. That is
  why `password` is described as `{ $secret: string }`: that is what
  `${secret:sales/erp-password}` becomes.
- `isSecretReference` tells a secret reference apart from ordinary data.
  Reading the secret is up to the tool that uses the definitions.

## Expected output

```text
connection erp: erp.internal.example:1433, password from secret "sales/erp-password"
pipeline orders: raw_orders
```
