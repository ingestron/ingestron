# Source request: retail (dev)

Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.

## landing

- Who: Someone who can export a small sample from the source
- Access: Read access to the data
- Recipe: A sample of what the source sends (`sample`, from `recipes/sample.yaml`)

Save a sample of each table:

- `sources/landing/orders.csv`
- `sources/landing/Refunds.CSV`
- `sources/landing/returns.csv`
- `sources/landing/exports.v2.csv`

Export a few rows, with a header, as CSV, JSON, JSON Lines or Parquet.

### If that cannot be done

- A data contract (ODCS) for the tables, from the source's team, saved as `sources/landing.odcs.yaml`.
- The columns file, saved as `sources/landing.columns.csv`, with one row for each column and these fields, in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.

## Importing

Import each file you saved, from the project's folder:

```sh
ingestron source import landing sources/landing/orders.csv --env dev
ingestron source import landing sources/landing/Refunds.CSV --env dev
ingestron source import landing sources/landing/returns.csv --env dev
ingestron source import landing sources/landing/exports.v2.csv --env dev
```

A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.
