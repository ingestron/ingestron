# @ingestron/pack-adf

The Azure Data Factory pack: copies tables from sources the data platform
cannot reach (`connectivity: private`) into a landing folder, where a
platform pack picks them up. Use it after a platform pack:

```yaml
packs: [databricks@1, adf@1]
```

Its rule chooses `adf-copy` for private sources. The output is ADF's own
resource JSON, in the folders ADF keeps in Git (`linkedService/`, `dataset/`,
`pipeline/`, `trigger/`), so it can be added to a factory's repository and
published as usual:

- a **SQL Server linked service** through a self-hosted integration runtime,
  with the password as a Key Vault secret;
- a **Key Vault** linked service when configured, and a **landing storage** linked
  service (managed identity);
- a **pipeline** per connection and database with a copy per table: only
  the contract's columns, the whole table or only the window's changes,
  written as Parquet to `<landing>/<object>/`;
- a **tumbling window trigger**, started in production and stopped
  elsewhere.

The self-hosted integration runtime and the Key Vault are shared
infrastructure: they are referenced by name, never created.

## Example

```ts
import { loadDefinitions } from "@ingestron/definitions";
import { adf } from "@ingestron/pack-adf";
import { databricks } from "@ingestron/pack-databricks";

const result = loadDefinitions("samples/starters/private-sql-server", {
  packs: [databricks, adf],
  environment: "prod",
});
if (result.model) for (const path of Object.keys(adf.build(result.model))) console.log(path);
```

Example [private-sql-server](../../samples/starters/private-sql-server/) has the
generated files for both packs. User documentation lives in the [docs site](../../apps/docs/content/docs/index.mdx).
Every setting is listed on its SQL Server connector page.

Microsoft's published Data Factory resource schema (2018-06-01) predates the
current SQL Server linked service, so it cannot validate this output; the
tests check the shapes in the sources below.

## Sources (accessed 2026-10-25)

Microsoft Learn: [SQL Server connector](https://learn.microsoft.com/en-us/azure/data-factory/connector-sql-server),
[Parquet format](https://learn.microsoft.com/en-us/azure/data-factory/format-parquet),
[ADLS Gen2 connector](https://learn.microsoft.com/en-us/azure/data-factory/connector-azure-data-lake-storage),
[Key Vault secrets](https://learn.microsoft.com/en-us/azure/data-factory/store-credentials-in-key-vault),
[tumbling window triggers](https://learn.microsoft.com/en-us/azure/data-factory/how-to-create-tumbling-window-trigger),
[source control](https://learn.microsoft.com/en-us/azure/data-factory/source-control).

## Dependencies

[`@ingestron/definitions`](../definitions/README.md) only.
