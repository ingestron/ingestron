# Source request: retail (dev)

Ingestron needs to know what each source table looks like: its columns, their types and its key. Only names and types are needed, never rows of real data. Save each file where this request says.

## crm

- Who: A Salesforce administrator, or a user who can call the REST API
- Access: API Enabled, and read access to each object
- Recipe: Salesforce (`salesforce`, from `recipes/salesforce.yaml`)

Call this URL:

- `{instanceUrl}/services/data/v62.0/sobjects/Account/describe`, saved as `sources/crm/Account.json`
- `{instanceUrl}/services/data/v62.0/sobjects/Opportunity/describe`, saved as `sources/crm/Opportunity.json`

With curl or Postman, using a bearer token for the org.

Fill in before use:

- `{instanceUrl}`: The org's base URL, such as https://example.my.salesforce.com

### If that cannot be done

- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as `sources/crm/<object>.<csv|json|jsonl|parquet>`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.
  - `sources/crm/Account.csv`
  - `sources/crm/Opportunity.csv`
- A data contract (ODCS) for the tables, from the source's team, saved as `sources/crm.odcs.yaml`.
- The columns file, saved as `sources/crm.columns.csv`, with one row for each column and these fields, in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.

## erp

- Who: Someone who can query the catalog views of the source database
- Access: VIEW DEFINITION on the database
- Recipe: SQL Server (`sqlserver`, from `recipes/sqlserver.yaml`)

Run this query:

```sql
SELECT c.TABLE_CATALOG AS table_catalog, c.TABLE_SCHEMA AS table_schema,
       c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name,
       c.ORDINAL_POSITION AS ordinal_position, c.DATA_TYPE AS data_type,
       c.IS_NULLABLE AS is_nullable, k.ORDINAL_POSITION AS primary_key_position
FROM INFORMATION_SCHEMA.COLUMNS AS c
LEFT JOIN (
  SELECT u.TABLE_CATALOG, u.TABLE_SCHEMA, u.TABLE_NAME, u.COLUMN_NAME, u.ORDINAL_POSITION
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS u
  JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS t
    ON t.CONSTRAINT_NAME = u.CONSTRAINT_NAME AND t.TABLE_SCHEMA = u.TABLE_SCHEMA
  WHERE t.CONSTRAINT_TYPE = 'PRIMARY KEY'
) AS k ON k.TABLE_CATALOG = c.TABLE_CATALOG AND k.TABLE_SCHEMA = c.TABLE_SCHEMA
      AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA IN ('dbo', 'sales')
```

Run the query in a SQL client and export the result as CSV with a header row.

Save the result as `sources/erp.catalog.csv`.

### If that cannot be done

- A sample of each table, exported as CSV, JSON, JSON lines or Parquet and saved as `sources/erp/<object>.<csv|json|jsonl|parquet>`. A Parquet file's schema is enough. A CSV or JSON sample should hold a few rows of synthetic or non-sensitive data: Ingestron reads only the names and types, and copies no value.
  - `sources/erp/ERP_DEV.dbo.Customers.csv`
  - `sources/erp/ERP_DEV.sales.Orders.csv`
- A data contract (ODCS) for the tables, from the source's team, saved as `sources/erp.odcs.yaml`.
- The columns file, saved as `sources/erp.columns.csv`, with one row for each column and these fields, in order: `table_catalog`, `table_schema`, `table_name`, `column_name`, `ordinal_position`, `data_type`, `is_nullable` (`YES` or `NO`), `primary_key_position` (empty when the column is not in the key). A script, a catalog export or a spreadsheet can make it.

## landing

Every table its flows read is in sources/landing.yaml:

- `returns`: sample, captured 2026-11-10
- `shipments`: sample, captured 2026-11-11

## Importing

Import each file you saved, from the project's folder:

```sh
ingestron source import crm sources/crm/Account.json
ingestron source import crm sources/crm/Opportunity.json
ingestron source import erp sources/erp.catalog.csv
```

A file saved as one of the alternatives is imported the same way, with its own path. Add `--dry-run` to see what a file would change without writing anything.
