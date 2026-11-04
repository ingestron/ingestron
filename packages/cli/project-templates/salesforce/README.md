# Salesforce

Two Salesforce objects through a Unity Catalog connection. SaaS sources need
no gateway: [one ingestion pipeline](build/databricks/resources/crm_salesforce_ingestion.pipeline.yml)
writes `accounts` and `opportunities`, keyed by `Id`, with only the
contract's fields.
