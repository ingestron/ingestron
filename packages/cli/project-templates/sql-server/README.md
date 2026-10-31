# SQL Server

The ERP database is reachable from the workspace over private networking
(`connectivity: workspace`), so the pack ingests it with Lakeflow Connect:

- [a gateway](build/prod/resources/erp_erp_gateway.pipeline.yml) that captures
  changes continuously, with the cluster policy from the standard;
- [an ingestion pipeline](build/prod/resources/erp_erp_ingestion.pipeline.yml)
  that writes `customers` (SCD type 1) and `invoices` (SCD type 2, from
  `mode: history`), each with only its contract's columns;
- [our pipeline](build/prod/src/erp/silver/customer_balances.sql), whose
  transform reads both, using the current invoice versions;
- [a job](build/prod/resources/erp_refresh.job.yml) that refreshes ingestion
  first and our pipeline after it.

The Unity Catalog connection `erp_sqlserver_<environment>` must exist; the
definitions name it but hold no credentials.
