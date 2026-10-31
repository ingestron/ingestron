# Kafka

Two topics of an Event Hubs namespace, read through its Kafka endpoint.
[The ingestion pipeline](build/dev/resources/clickstream_events_ingestion.pipeline.yml)
runs on the `PREVIEW` channel, appends every message, and parses JSON values
with the contract's column types. In production it runs continuously; in
`dev` it runs when started (`databricks bundle run`), which costs less. Set
`continuous: true` to change that. The pack chose `mode: append`
for Kafka by its own rule.

Lakeflow Connect for Kafka is in Beta on Databricks (checked 2026-10-25); the
generated file says so.
