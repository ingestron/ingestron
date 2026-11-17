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

`init` asks only what picks the project: the starter (`--template`), the kit
(`--kit`, section "Kits" below), or the connector, connectivity and route; and,
last, which assistant files to write (below). Everything else has a default:

- the project id is the folder's name, as a valid id (`--name` gives another);
- the environments are `dev` and `prod`, or a starter's or a kit's own
  (`--env` gives others);
- the standard is the route's, the starter's or the kit's (`--standard` gives
  another, except with a kit).

`--yes` takes the default of each choice not given. A template's
`template.yaml` MAY still list `questions`, for templates from elsewhere: they
are never asked; `--set <value>=<text>` answers one, else its default is
written to `values.<value>` in project.yaml. The built-in starters have none.

`init` can also write the project guide that coding assistants read, and the
files that point to it. `--assistant <names>` gives the names (a
comma-separated list, or the flag repeated; the default is `none`). With a
terminal and neither `--assistant` nor `--yes`, `init` asks for them last,
after every other question. The [guide specification](assistants.md) says which
files each name writes, what the guide says and how `plan` and `apply` keep it
current. `ingestron assistant add <names>` writes the same files into an
existing project.

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
written once. On a route through Data Factory they stay literal values in
project.yaml: where environments differ, they become ARM parameters of the
factory. Data Factory takes a deploy-time value only as a whole value, so
`${envvar:…}` there, inside the composed URL, is `DEPLOY_VALUE`.

The built-in starters follow the same rules in their own files, except
`duckdb`, which runs on the user's computer and has nothing to replace.

A connection setting is, by its connector's metadata (definitions
specification, "Connector authoring metadata"):

- left out, when the metadata marks it `optional`;
- a secret: `${secret:<project id>-<connection id>-<setting>}`, each `_`
  written `-`;
- a default: the setting's `default`;
- a value to check: for a setting whose value is a number, `true` or
  `false`, or one of its `values`, and that has no `default`, the example's
  value, with a comment that ends `the example's value, check it`;
- otherwise `REPLACE_ME`.

A source option is kept when its schema allows only some values, a secret
as above, and kept as written when it is not text. A text option is left out
when the project resolves without it; `init` writes as `REPLACE_ME` only
those the connector needs, each found by resolving with it left out. A query
is `REPLACE_ME` when the connector requires one, and is left out otherwise.
Optional connection settings the example does not write are left out.

### Written defaults

These are written, each with a short comment: the connection's
`connectivity`; the standard's `packs` and a starter's `naming.catalog`; each flow's `ingest.uses`; the
schedule (the ADF window's `every`, and its `start`, midnight UTC on the day
`init` runs; on a route into Databricks through Data Factory, a Databricks
`schedule` that refreshes hourly, with `timezone: UTC`); the landing
folder; `layout: snapshot` where the route sets it; and Synapse's
`data_source_location` and DuckDB's `published`, in the same storage account
as the landing folder. Naming, layers, types, quality, store methods,
resource names and who the jobs run as stay the packs' defaults.

A comment is one line of at most 100 characters directly above the value (a
default's MAY follow it on the same line): the setting's description, its
first sentence without the full stop. The files are edited as YAML
documents, so the example's comments are kept; where the example already has
a comment line above a value, it is kept in place of the description, so
there is exactly one.

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

[conformance/projects.json](conformance/projects.json) lists under
`replaceMe`, for some routes, the names `init --yes` writes as `REPLACE_ME`,
in the order README.md lists them.

### README.md

`init` writes README.md once. It is the user's: Ingestron never writes it
again. When the folder already has one, that is not a clash: `init` keeps it
and prints the values to replace instead. The README has, in order:

1. the project id as its title, then what the route, starter or kit does,
   the date `init` wrote it, that the file is the user's, for a kit the line
   `The standard comes from <id>@<version>; STANDARD.md explains its choices.`,
   and which table and contract are examples to rename; for a project with
   no flow yet, that its lists show the project as it starts, and that once
   connections and flows are added `ingestron plan` shows the values still to
   replace and `ingestron request --env <environment>` what the platform
   needs, for the last environment;
2. **Build and review in VS Code**: configure YAML with hover, completion and Reference, request and import source metadata, select environments and compare effective modes, then Plan, local Apply and Check. These actions do not deploy or execute generated assets;
3. **Run it**: `ingestron plan` and `ingestron apply`;
4. **Values to replace before deploying**: a row for each name that is still
   `REPLACE_ME`, with each `file:line`, what it is (the comment above it),
   where to find it (the setting's `find`, else the connector's
   documentation) and its environments (`all` for a value written once). For
   a kit, a value in the Platform, or a project.yaml value a Platform field
   reads as its whole value, takes that field's `find` from the field
   reference: a pack's section field (`databricks.run_as.service_principal_name`)
   or the Platform's own (`alerts[].to[]`), as the editor's hover shows it.
   Other projects keep "Your platform team" there. The
   rows are the project's `REPLACE_ME` diagnostics, so they match `plan`.
   With none, "Nothing to replace: the project runs as written.", or, when
   every environment is resolved with the host's values only ([output
   folders](outputs.md), section 1), "Nothing to replace: this project runs
   on this computer.";
5. **Values to check**, when the project has any: a row for each value to
   check (above), with its place, what it is and where to find it;
6. **Secrets to create**: each secret's name, where it goes and what it
   holds; with none, that no connection names a Key Vault secret, or, for a
   project with no connection yet, that none is needed yet and that each
   `${secret:NAME}` a connection names is a secret to create;
7. **Deploy**: for each output folder, Data Factory's first, the commands
   that deploy it, written for `<environment>`, what each placeholder is, and
   the deploy-time values its pack's `deployValues` name; Data Factory's
   steps link to the documentation's full page. With no output folder, for a
   project with no flow yet, that there is nothing to deploy until a flow is
   added; otherwise, to run `ingestron plan` first, since the definitions have
   problems to fix;
8. **Ask the platform team**: `ingestron request --env <environment>`, for
   the last environment;
9. **Values per environment**: project.yaml's
   `environments.<name>.values`, `${envvar:…}` and `${secret:…}`; on a route
   through Data Factory, that the storage account and Key Vault stay in
   project.yaml (above).

Code blocks are fenced, with their language.

`init` also writes `.gitignore`, or, when the folder has one, adds only the
lines it lacks and changes nothing else in it: the `.env` lines, and, on a
route through Data Factory, `node_modules/`, `downloads/` and `arm/`, which
the README's export steps write into the project folder. The README says so
beside those steps.

After the plan, `init` prints
`<n> values are still REPLACE_ME: README.md lists each one and where to find it.`,
where `<n>` counts the README's rows, one per name, or
`Nothing to replace: the project runs as written.` The plan's own count line
is not printed then. When the folder's README.md is kept, `init` prints each
row with where to find it, and the secrets to create, and project.yaml's
first comment does not mention README.md.

### Conformance

Each folder in [conformance/init/](conformance/init/) is a case: `case.json`
gives the `args`, the `date` init runs on, the `folder` it creates, the
`exit` code and the `lastLine` of the output; `files/` holds files the
project must have, each exactly, README.md included. The cases are not
formatted by Prettier. A case whose name starts `kit-` reads a kit of the
installed `@ingestron/standards` package.

## Kits

`init --kit <spec>` starts the project from a kit ([kits.md](kits.md)): a
published, dated Standard with a small project that builds. `--kit` is not
combined with `--template` or `--standard`; `init` refuses, before anything
else, with `Choose --kit, --template or --standard, not two.`

Alone, `--kit` copies the kit's files into the folder and asks nothing:

- every file of the kit's folder but `kit.yaml`, each at the same path;
- the kit's `README.md` as `STANDARD.md`, which explains the Standard's
  choices. README.md is `init`'s own, as above;
- a file named `gitignore` as `.gitignore`, with the `.env` lines added as
  for any project.

`--name`, `--env` and `--set` apply as they do to a template: the project id
is written to project.yaml, the environments default to the kit's own, and
`--set` writes a value at its name's locations.

`init` refuses, before writing anything, a kit whose `requires.ingestron` the
CLI's own version does not meet:
`The kit <id>@<version> needs ingestron <range>; this is <version>.`

`--kit <id>` alone takes the kit's newest version that is not a preview,
installed or in the catalogue ([kits.md](kits.md), "Where kits are found").
When the catalogue cannot be read, `init` uses the newest installed version
and first prints
`Could not reach the catalogue; using the newest installed version, <id>@<version>.`

With `--connector`, `--connectivity` or `--via`, the kit gives the Standard
and the composition above gives the source:

- every pack the route needs must be in the kit's `packs`, else
  `The kit <id> uses <packs>; the route <via> needs <packs>.`, the packs
  joined by `, `;
- the kit gives `standard.yaml`, as it is, `project.yaml`, `platform.yaml`,
  `STANDARD.md` and `.gitignore`: its files at the top of its folder;
- the composition gives the connection, flows, contracts and transforms,
  written as the route writes them. The kit's own, and anything else in the
  kit's sub-folders, are not written;
- in `project.yaml` and `platform.yaml`, a key the kit does not write is
  filled from the composition, at any depth, with its comment. Where both
  write a key, the kit's value stays, with its comments. A list is one
  value: the kit's is kept whole. A top-level `values.<name>` is not filled
  when the kit writes `<name>` under the `values` of every environment it
  has, as the Databricks kit does for `landing`: the kit's per-environment
  values are the ones read;
- `.gitignore` has the kit's lines, then those of the composition it lacks.

The project must resolve before anything is written, and a file already in
the folder is a clash, as for every project. Then `init` prints
`Created <folder> from the kit <id>@<version> (<n> files).`, or, with a
route, `Created <folder> from the kit <id>@<version> and <connector> via <via> (<n> files).`,
and the plan.

## Platform-first projects and independent additions

`init --platform <id>` creates a standard and target platform without a source,
flow, contract or sample dataset. Supported ids are reported by `projectPlatforms`.
`--standard <file>` preserves that standard's content; it never relaxes fixed
settings. `init --kit <id@version> --empty` omits the kit's worked source example.
Existing explicit connection and template options keep their behaviour.

Such a project's `imports` name only what it writes. A pattern that no file
it writes matches, such as `connections/*.yaml` before there is a connection,
is left out, so a new project gives no `No files match the import` warning.
The pattern comes back with the section's first file (below).

The editor's New project asks two questions. The first is where the project
runs: one of the `projectPlatforms`, or a sample project (a built-in starter,
as `--template`). The second, for a platform, is which standard: a new one
(`--platform`, offered first), a published standard whose id starts with that
platform (`--kit <id@version> --empty`), or a standard file (`--platform` with
`--standard`). It offers no connection-first start; that stays the CLI's
`--connector` option, and the created notice offers Add connection instead.
Environments and target settings are reviewed before a source is added. An
empty project is ready for configuration, rather than evidence of data
ingestion.

`connection add <id> --connector <id> --connectivity <reachability>` adds one
connection. Choices come only from ingestion methods in the project's standard
packs and configured platform. If more than one method matches, `--method` selects its connection profile. Required settings use provider defaults or explicit
REPLACE_ME values; secrets use named references. It does not add a flow, import
metadata, change the standard or contact a source. Existing ids and files are refused.

`flow add <id> --connection <id> --object <name>` adds a flow independently.
The method must be compatible with the connection, its reachability and the
project's standard/platform; ambiguity requires `--method`. Imported objects are
selectable without truncating names containing spaces. Multiple objects may be
selected in the editor. Existing definitions are preserved. Planning remains the
full validation of contracts, settings and standard constraints.

#### The new file's import

A connection, flow or contract that one of them adds is loaded through
`project.yaml`'s `imports`. When no import matches the new file
(`matchesImport`, configuration specification), the addition also adds one
entry at the end of `imports`, keeping `project.yaml`'s comments and layout,
as a source import does (sources specification, section 3):

- the folder's pattern, such as `connections/*.yaml`, when the folder holds no
  other YAML file;
- otherwise the file's own path, such as `connections/erp.yaml`, so that no
  other file already in the folder starts being loaded.

This is the only change to an existing file. The CLI writes the new file and
`project.yaml` together, so a failure leaves neither written, and says what it
added: `Added connections/erp.yaml; project.yaml now imports connections/*.yaml.`
When the imports still leave the new file out once the entry is added, the
addition refuses:
`Add <file> or its folder's YAML glob to project.yaml imports, then try again. Nothing written.`

The same holds for a contract that `contract <sample>`, `contract
--from-metadata` or the editor's Draft contract writes.

In the editor, Add connection, Add flow and Draft contract follow one save
rule. The new file is written to disk. The changes to existing files, the
import and Draft contract's `contract:` line, are one undoable edit that
changes only the lines they add. Each changed file that had no unsaved changes
is then saved; one that had keeps them, with the change, unsaved, since saving
it would also save work the action did not make. The notification names the
new file, the import added and any file left unsaved:
`Added connections/erp.yaml; project.yaml now imports connections/*.yaml. project.yaml had unsaved changes, so it stays unsaved: save to keep the change.`
