# Change data

The source files hold one row per change: a key, a time and an operation.

- `accounts` uses `mode: upsert`: [the table](build/dev/src/crm/bronze/accounts.sql)
  keeps only the current row per key (`STORED AS SCD TYPE 1`); rows whose
  `operation` is `DELETE` remove the key.
- `contacts` uses `mode: history`: [the table](build/dev/src/crm/bronze/contacts.sql)
  keeps every version (`STORED AS SCD TYPE 2`), keyed by two columns in
  `primaryKeyPosition` order.

Each also gets a `<table>_changes` streaming table with the records as
received. Keys come from the contract's `primaryKey` columns; `sequence_by`,
`delete_when` and `except_columns` are settings of the `streaming-table`
method. Without a key or `sequence_by`, loading fails with `METHOD_CHECK`.
