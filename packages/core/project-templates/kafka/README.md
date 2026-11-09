# Kafka

Two topics of an Event Hubs namespace, read through its Kafka endpoint.
[The ingestion pipeline](build/databricks/resources/clickstream_events_ingestion.pipeline.yml)
runs on the `PREVIEW` channel, appends every message, and parses JSON values
with the contract's column types. The flow sets `continuous: false`, so the
refresh job runs it, which costs less. One bundle covers every environment, so
this is the same in each; set `continuous: true` to run it continuously
everywhere. The flow keeps `history: none`, the pack's own choice for Kafka.

Lakeflow Connect for Kafka is in Beta on Databricks (checked 2026-10-25); the
generated file says so.
