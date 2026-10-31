# Land files only

ADF copies the ERP's tables into storage, and the flows end there:
`store: { default: none }` in `standard.yaml`, with only the ADF pack.

`layout: snapshot` lands one file per table, replaced by each daily load:

| Table       | File                                                    |
| ----------- | ------------------------------------------------------- |
| `customers` | `<landing>/erp.dbo.Customers/erp.dbo.Customers.parquet` |
| `invoices`  | `<landing>/erp.dbo.Invoices/erp.dbo.Invoices.parquet`   |

`ingestron apply` writes the ADF resources under `build/<environment>/`:
the SQL Server linked service through the `shir-erp` integration runtime, the
pipeline with a copy per table, and a daily trigger. Contract quality rules are
not checked, since nothing reads the files before the reports do.
