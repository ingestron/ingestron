# Connection-first project creation

`init` creates ordinary definitions by composing tested source examples. It
adds no definition kind, package or template language. The default workflow
selects a connector, network reachability and a supported ingestion route,
and asks nothing else. Connector categories organise discovery; capability
and maturity come from the selected pack's existing metadata.

`--connector`, `--connectivity` and `--via` provide the same choices
non-interactively. `databricks` means direct ingestion and storage. Every ADF
route lands the source's data with ADF, then:

- `adf-databricks`: Databricks reads them into tables (`packs: [databricks@2,
adf@2]`);
- `adf-synapse`: Synapse serverless SQL shows them as views (`packs:
[synapse@2, adf@2]`, `store: { default: synapse-view }`, with
  `synapse-view`'s data source at the landing storage);
- `adf-duckdb`: DuckDB builds tables from them and publishes Parquet (`packs:
[duckdb@2, adf@2]`, with `duckdb-table`'s `published` folder beside the
  landing), started after the copies by a Container Apps job when the user
  sets `after_copy`;
- `adf-landing`: the flows end at the landed files (`packs: [adf@2]`, `store: {
default: none }`), for reports that read the files.

Each ADF route is named for what reads the landed files, or for the landing
itself when nothing does. The earlier names are still accepted as `--via` and
create the same project, though no menu or list shows them: `adf` (before CLI
1.6) for `adf-databricks`, and `adf-files` (before CLI 1.7) for `adf-landing`,
renamed because `adf-files` is also the name of ADF's method that copies files
as they are.

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
ADF-only sources default to private connectivity. With `--yes`, an
unanswered choice takes its default. A non-interactive run without `--yes`
names the missing flag rather than waiting. Interactive choices accept IDs or
displayed numbers and reject unknown combinations.

The composer selects only the requested source from the ADF guide or a tested
Databricks source example, preserving contracts and needed transforms. The
chosen ingest method is explicit in each source flow. The resulting project
contains only the method settings and packs needed by that route. Required
connection, object and string extraction and infrastructure values are
written where they are used, as the next section says. Users adapt the
example contracts to their actual source before deployment.

All environments resolve before any file is written. Incompatible standards,
invalid answers and source combinations leave no partial project. Existing
files and symbolic links are never replaced. Creation then shows the normal
plan; apply still owns generated files through the existing manifest.

CLI and VS Code use the same choice metadata, composition and validation. VS Code provides category and source search, filters routes by
connectivity, and allows cancellation before any write. Folder selection comes
last. Explicit folder/Git templates and named example presets can remain as
advanced `--template` inputs where useful, but cannot be combined with dynamic
source flags and are not the wizard's default model. Packaged CLI and VSIX must
carry the same source recipes and work without a repository checkout.

## Questions and values

`init` asks only what picks the project: the starter (`--template`), or the
connector, connectivity and route. Everything else has a default:

- the project id is the folder's name, as a valid id (`--name` gives another);
- the environments are `dev` and `prod`, or a starter's own (`--env` gives
  others);
- the standard is the route's or the starter's (`--standard` gives another).

`--yes` takes the default of each choice not given. A template's
`template.yaml` MAY still list `questions`, for templates from elsewhere: they
are never asked; `--set <value>=<text>` answers one, else its default is
written to `values.<value>` in project.yaml. The built-in starters have none.

### REPLACE_ME

A value that Ingestron cannot know, such as a host, a server, a login, a
storage account, a Key Vault, an integration runtime, a Unity Catalog
connection, a source object or a required query, is written as `REPLACE_ME`
where it is used (definitions specification, section 1), with one comment
line above it. Where the value needs a shape, each unknown part is
`REPLACE_ME`, so the project resolves and generates: a source object written
`database.schema.table` by its connector's metadata is
`REPLACE_ME.REPLACE_ME.REPLACE_ME`, a landing folder is
`abfss://landing@${values.storage_account}.dfs.core.windows.net/<project id>`,
and a Key Vault is `https://${values.key_vault}.vault.azure.net`.

The storage account and the Key Vault are per environment: each is one
`REPLACE_ME` under `environments.<name>.values` in project.yaml, for every
environment, and the platform composes the URLs from them. Everything else is
written once.

The built-in starters follow the same rules in their own files, except
`duckdb`, which runs on the user's computer and has nothing to replace.

A connection setting is, by its connector's metadata (definitions
specification, "Connector authoring metadata"):

- a secret: `${secret:<project id>-<connection id>-<setting>}`, each `_`
  written `-`;
- a default: the setting's `default`, else, for a setting whose value is a
  number, `true` or `false`, or one of its `values`, the example's value;
- otherwise `REPLACE_ME`.

A source option is a default when its schema allows only some values, a
secret as above, and `REPLACE_ME` when it is text; others stay as the
example writes them. A query is `REPLACE_ME` when the connector requires one,
and is left out otherwise. Optional connection settings the example does not
write are left out.

### Written defaults

These are written, each with a short comment: the connection's
`connectivity`; the standard's `packs`; each flow's `ingest.uses`; the
schedule (the ADF window's `every`, and its `start`, midnight UTC on the day
`init` runs; Databricks' `schedule.cron` with `timezone: UTC`); the landing
folder; `layout: snapshot` where the route sets it; and Synapse's
`data_source_location` and DuckDB's `published`, in the same storage account
as the landing folder. Naming, layers, types, quality, store methods,
resource names and who the jobs run as stay the packs' defaults.

A comment is one line of at most 100 characters directly above the value (a
default's MAY follow it on the same line): the setting's description, its
first sentence without the full stop. The files are edited as YAML
documents, so the example's comments are kept.

### Names and `--set`

Each `REPLACE_ME`, secret and connection setting has a name:

| Where                                               | Name             |
| --------------------------------------------------- | ---------------- |
| a connection's `settings.<key>`                     | `source_<key>`   |
| a table's `object`                                  | `<table>_object` |
| a flow's `ingest.with.query`                        | `source_query`   |
| a flow's `ingest.with.source_options.<key>`         | `option_<key>`   |
| a platform's `settings.<method>.<key>`              | `<key>`          |
| project.yaml's `values.<name>`, or an environment's | `<name>`         |
| anywhere else                                       | the last key     |

`--set <name>=<text>` writes the text at every location of the name, and
`--set <environment>.<name>=<text>` at that environment's only, for a name
under `environments.<environment>.values`. A value that was a number or
`true` or `false` is read as one. `init` refuses, before writing anything:

- an unknown name, listing the names the project has;
- `landing`, `synapse_data_source_location` and `duckdb_published`, which are
  composed from `storage_account`, naming it;
- a `key_vault` written as a URL, naming the vault's name instead;
- `<environment>.<name>` for an environment the project does not have, or a
  name written once for every environment.

[conformance/projects.json](conformance/projects.json) lists, for some
routes, the names `init --yes` writes as `REPLACE_ME`.

### README.md

`init` writes README.md once. It is the user's: Ingestron never writes it
again. When the folder already has one, that is not a clash: `init` keeps it
and prints the values to replace instead. The README has, in order:

1. the project id as its title, then what the route or starter does, the
   date `init` wrote it, that the file is the user's, and which table and
   contract are examples to rename;
2. **Run it**: `ingestron plan` and `ingestron apply`;
3. **Values to replace before deploying**: a row for each name that is still
   `REPLACE_ME`, with each `file:line`, what it is (the comment above it),
   where to find it (the setting's `find`, else the connector's
   documentation) and its environments (`all` for a value written once). The
   rows are the project's `REPLACE_ME` diagnostics, so they match `plan`.
   With none, "Nothing to replace: the project runs as written.";
4. **Secrets to create**, when the project has any: each secret's name, where
   it goes and what it holds;
5. **Deploy**: for each output folder, the commands that deploy it per
   environment, and the deploy-time values its pack's `deployValues` name;
6. **Ask the platform team**: `ingestron request --env <environment>`;
7. **Values per environment**: project.yaml's
   `environments.<name>.values`, `${envvar:…}` and `${secret:…}`.

After the plan, `init` prints
`<n> values are still REPLACE_ME: README.md lists each one and where to find it.`,
or `Nothing to replace: the project runs as written.`
