# Connection-first project creation

`init` creates ordinary definitions by composing tested source examples. It
adds no definition kind, package or template language. The default workflow
selects a connector, network reachability, a supported ingestion route, one
standard, then configuration values. Connector categories organise discovery;
capability and maturity come from the selected pack's existing metadata.

`--connector`, `--connectivity` and `--via` provide the same choices
non-interactively. `databricks` means direct ingestion and storage. Every ADF
route lands the source's data with ADF, then:

- `adf-databricks`: Databricks reads them into tables (`packs: [databricks@1,
adf@1]`);
- `adf-synapse`: Synapse serverless SQL shows them as views (`packs:
[synapse@1, adf@1]`, `store: { default: synapse-view }`, with
  `synapse-view`'s data source at the landing storage);
- `adf-duckdb`: DuckDB builds tables from them and publishes Parquet (`packs:
[duckdb@1, adf@1]`, with `duckdb-table`'s `published` folder beside the
  landing), started after the copies by a Container Apps job when the user
  sets `after_copy`;
- `adf-files`: the flows end at the landed files (`packs: [adf@1]`, `store: {
default: none }`), for reports that read the files.

Each ADF route is named for what reads the landed files. `adf`, the name of
`adf-databricks` before CLI 1.6, is still accepted as `--via` and creates the
same project; no menu or list shows it.

`adf-synapse` and `adf-duckdb` are offered only where ADF copies tables (its
methods that land typed files under the contract's names), not where it copies
files as they are; `adf-synapse` not for Microsoft 365, which lands JSON. Their
ADF copies land one file per table replaced by each load (`layout: snapshot`),
unless a flow copies windows (`mode: incremental`, or a date filter), whose
files must all be kept. Only routes whose method reads the
connector and supports the connectivity can be selected. The standard must
contain and permit the selected method; ordinary resolution is authoritative.
One standard can configure both packs. No independent per-platform standard
merging mechanism is introduced.

The default source is files. Its default route is direct Databricks with public
connectivity. Other sources prefer a supported direct route where available;
ADF-only sources default to private connectivity. With `--yes`, unanswered
configuration uses the documented synthetic example defaults. A non-interactive
run without defaults names the missing flag rather than waiting. Interactive
choices accept IDs or displayed numbers and reject unknown combinations.

The composer selects only the requested source from the ADF guide or a tested
Databricks source example, preserving contracts and needed transforms. The
chosen ingest method is explicit in each source flow. The resulting project
contains only the method settings and packs needed by that route. Required
connection, object and string extraction/infrastructure values are exposed as
ordinary project values; source-specific non-string defaults remain visible
in YAML. Secret inputs remain references, never real credentials in examples.
Users adapt the synthetic contracts to their actual source before deployment.

All environments resolve before any file is written. Incompatible standards,
invalid answers and source combinations leave no partial project. Existing
files and symbolic links are never replaced. Creation then shows the normal
plan; apply still owns generated files through the existing manifest.

CLI and VS Code use the same choice metadata, question list, composition and
validation. VS Code provides category and source search, filters routes by
connectivity, and allows cancellation before any write. Folder selection comes
last. Explicit folder/Git templates and named example presets can remain as
advanced `--template` inputs where useful, but cannot be combined with dynamic
source flags and are not the wizard's default model. Packaged CLI and VSIX must
carry the same source recipes and work without a repository checkout.
