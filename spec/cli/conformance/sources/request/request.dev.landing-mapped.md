# Source request: retail (dev)

Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.

## landing

- Who: An administrator who can call the table API
- Access: Read access to the dictionary tables
- Recipe: Mapped columns from a JSON result (`files-mapped`)

Call this URL:

```text
https://example-dev.example.com/api/v2/table/sys_dictionary
```

Save the response as `sources/landing.catalog.json`.

### If that cannot be done

- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as `sources/landing/<object>.<csv|json|jsonl|parquet>`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.
  - `sources/landing/orders.csv`
  - `sources/landing/Refunds.CSV`
  - `sources/landing/returns.csv`
  - `sources/landing/exports.v2.csv`
- A data contract (ODCS) for the tables, from the source's team, saved as `sources/landing.odcs.yaml`.
- The columns file, saved as `sources/landing.columns.csv`, with one row for each column and these fields, in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.

## Importing

Import each file you saved, from the project's folder:

```sh
ingestron source import landing sources/landing.catalog.json --env dev
```

A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.
