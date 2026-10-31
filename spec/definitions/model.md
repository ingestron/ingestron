# Definitions: specification

Version: 1 (draft). Status: implemented by `@ingestron/definitions`
(TypeScript). Other implementations must pass the same
[conformance cases](conformance/). Users should start with the package
[README](../../packages/definitions/README.md) and the
[documentation](https://docs.ingestron.io).

The key words MUST, MUST NOT and MAY are used as in RFC 2119.

## 1. Loading

A project is loaded with the `@ingestron/config` syntax (its
[specification](../config/syntax.md))
and these kinds, all `apiVersion: ingestron.io/v1` except contracts:

| Kind           | Schema                             | Links                                                       |
| -------------- | ---------------------------------- | ----------------------------------------------------------- |
| `Standard`     | `standard.schema.yaml`             |                                                             |
| `Platform`     | `platform.schema.yaml`             |                                                             |
| `Connection`   | `connection.schema.yaml`           |                                                             |
| `Flow`         | `flow.schema.yaml`                 | `/source` → Connection; `/tables/*/contract` → DataContract |
| `Transform`    | `transform.schema.yaml`            | `/contract` → DataContract                                  |
| `DataContract` | ODCS v3.1.0 (`apiVersion: v3.1.0`) |                                                             |

A project MUST have exactly one `Standard` (`NO_STANDARD`, `MANY_STANDARDS`)
and at most one `Platform` (`MANY_PLATFORMS`). The standard's `packs` list
names the packs to use, `<id>@<version>`. Each MUST be available
(`UNKNOWN_PACK`) in that major version (`WRONG_PACK`), and two packs MUST NOT
have a method of the same name (`METHOD_CONFLICT`).

Two placeholder forms exist. A `${…}` reference is replaced wherever text is
written, project.yaml's values included, by the `@ingestron/config` syntax.
A `{{ … }}` pattern is replaced only in a standard's or platform's `naming`
and in a transform's `code`, where per-table names such as `table` and
`layer` exist. A `{{ … }}` anywhere else in project.yaml or a document other
than a contract stays as written: that is `PLACEHOLDER_NOT_REPLACED`, a
warning at the text, with a fix to the `${…}` form when there is one:
`{{ environment }}` (or `env`) is `${environment.name}` and `{{ project }}`
is `${project.id}`.

A transform's `code` read with `${file:…}` is text, which the loader leaves
as written. Resolution replaces each `${values.<name>}` still in the code
(`<name>` may be a dotted path) with the environment's value, as the loader
does for code written inline; so in code, `$${values.<name>}` cannot keep
that text. Any other `${…}`, such as a SQL parameter, stays as written. A name with no value is
`UNKNOWN_CODE_VALUE`, an error at the code, listing the names that exist.

A problem is an error or a warning: a project resolves when it has no
errors, and its warnings, including those found while loading, are reported
with the model. Every problem is reported with the location of the value that caused it (for a method nobody named, such as a pack's default, the
flow's `source`, or its `store` when it has one), and
resolution continues so that all problems are found in one run. A problem
written once, such as on a flow shared by several tables, is reported once.

## 2. Packs

A pack provides, as data: `defaults` (naming patterns, layers, types,
quality actions), `rules` per action (`default` and `when`), and `methods`.
The actions are `ingest`, `transform`, `store` and `serve`. A serve method
`accepts` `table` and/or `files` and `produces` `table`; it makes a table's data
available somewhere else, such as SQL views over its files. A method MAY set
`needsOutput: true`: it reads the previous step's `output` (below). An ingest
method MAY set `reads: landed`: it reads the files another pack's method
lands, under its own settings, and reads no source, so its connectors and
connectivity are not checked. A pack's rule never matches such a method and
fixes never offer it; it is meant for environments that run on its pack
(section 4, "Runs on").

Each method has an `action`, the `connectors` it reads and the
`connectivity` it supports (ingest), what it `accepts` (transform, store)
and `produces` (`files`, `table` or `query`), `defaults`, a JSON Schema
for its `settings`, and optionally `placement`: which settings belong in the
platform (`platform`, such as shared infrastructure) or the standard
(`standard`, such as a schedule); the others belong in the definitions.

A method MAY describe its **output** for a table: where the step's data
lands (`location`, one file or a pattern with `*` for one level and `**` for
any depth), its `format` (`parquet`, `json`, `csv` or `delta`), and whether
each run replaces it or adds files (`loads`: `replace` or `add`). The
resolved step records it as `output`; a method that describes none leaves
`output` absent. Packs read another pack's output from the resolved model, so
they need not depend on each other. Implementations describe it in code, so
the data-only conformance pack has no cases for it.

With several packs, the **first** pack in the standard's list provides the
defaults; the rules' `when` lists are joined in list order, and an action's
pack default is the first pack's that has one. Each resolved step records
the `pack` its method belongs to.

## 3. Values from the standard, platform and definitions

Each value comes from the first of these that sets it, in this order of
precedence (later wins), except that a standard's `fixed` cannot be changed:

| Value   | 1 pack             | 2 standard       | 3 platform | 4 definitions            |
| ------- | ------------------ | ---------------- | ---------- | ------------------------ |
| naming  | `defaults.naming`  | `naming`         | `naming`   |                          |
| layers  | `defaults.layers`  | `layers`         |            | Flow / Transform `layer` |
| types   | `defaults.types`   | `types` (merged) |            | contract `physicalType`  |
| quality | `defaults.quality` | `quality`        |            | expectation `action`     |

Method settings are merged key by key (mappings deeply, other values
replaced) in this order: the method's `defaults`, the standard's
`settings.<method>`, the platform's `settings.<method>`, the matching `when`
rule's `with`, the flow's or transform's `<action>.with`, the table's
`<action>.with`, then the standard's `fixed.<method>`. A definition that sets
a fixed key to a different value is `FIXED_SETTING`. Where both the fixed
value and the definition's value are mappings, they are compared key by key
at every depth: keys beside the fixed ones are allowed, and the error is
reported at the changed key, named by its dotted path (`properties.acme.owner`). It has one fix, `Remove this setting`, which removes the key so the
fixed value applies. The result MUST match
the method's `settings` schema (`BAD_SETTING`), reported where the failing
key was last written.

Each key of a standard's `<action>.settings` and `<action>.fixed` MUST be a
method of the standard's packs for that action, and each key of the
platform's `settings` a method of the standard's packs (`UNKNOWN_METHOD`),
with a fix `Rename to "<method>"` for a method at most two edits away.

Required keys that no layer sets are one `BAD_SETTING` per flow or transform
that uses the method, at the flow's `source` (a transform: the document):
`"<method>" needs settings: <keys>.` It has one fix, `Add the missing
settings`, which adds each key, empty, where the method's `placement` says it
belongs: `platform` keys in the platform's `settings.<method>` (the
standard's when the project has no platform), `standard` keys in the
standard's `<action>.settings.<method>`, and the others in the flow's or
transform's `<action>.with`. An empty key is still reported, so nothing is
generated until each is filled in.

Each step records, for every top-level setting, the layer that last set it
(`origins`): `pack` (the method's defaults), `standard` (its settings),
`platform` (its settings),
`rule` (the matching rule's `with`), `definition` (the flow's or transform's
`with`), `table` (the table's `with`) or `fixed`, with the file and line where
it was written for every layer except `pack`. Tools use it to explain a
value.

## 4. Choosing a method

For each action of each table:

1. The flow's or transform's `<action>.uses`, if set. It MUST be in the
   standard's `allowed` list when one is given (`METHOD_NOT_ALLOWED`).
2. Otherwise the first matching rule of the standard's `when`, then of the
   packs' `when`. A rule matches when every fact it names equals the table's:
   `connectivity` and `connector` of the flow's connection, `input` (what the
   previous action produces) and `layer`. A pack's rule is skipped when its
   method cannot read the connection's connector or connectivity, so another
   pack can serve that source.
3. Otherwise the standard's `default`, else the pack's.

Each step records how its method was chosen (`chosenBy`): `by` is
`definition` (the flow's or transform's `uses`), `standard-rule`,
`standard-default`, `pack-rule`, `pack-default` or `runs-on`; a rule's facts are in
`when`; a pack's rule or default names its `pack`; and a choice written in a
file gives its `file` and `line`. Tools use it to explain why a method is
used where no file names it.

The chosen method MUST exist in the pack (`UNKNOWN_METHOD`) and be for this
action (`WRONG_ACTION`). An ingest method MUST list the connection's
connector (`CONNECTOR_NOT_SUPPORTED`) and, when it lists connectivity, the
connection's connectivity (`CONNECTIVITY_NOT_SUPPORTED`). A transform or store method MUST
accept what the previous action produces (`HANDOVER`); a transform's own
input is `table`. When an ingest method produces `table`, the table has no
store step, and a flow that names a store method is `HANDOVER`.

`none` is a reserved store choice, not a method. It MAY be written wherever a
store method is chosen: a flow's `store.uses`, a standard's `store.default`
or a `store.when` rule's `use`. It is subject to the standard's `allowed`
list like a method (`METHOD_NOT_ALLOWED`). When ingest produces `files` and
the store choice is `none`, the table has no store step: it ends at the
files ingest lands, and records `endsAtFiles`, how `none` was chosen, in the
same shape as a step's `chosenBy`. When ingest produces `table`, `none`
changes nothing. A `none` from a standard's or pack's rule or default applies only where
ingest hands over `files`, or where that is not known because ingest
failed; elsewhere, such as for a transform, the next matching rule or
default applies. A transform's store choice MUST NOT be `none`
(`HANDOVER`): a transform's query needs a store step. A transform MUST NOT
read a table that ends at the landed files (`HANDOVER`, at the input):
there is no table to read.

When nothing chooses a store method, the problem is `UNKNOWN_METHOD` at the
flow, with fixes: `End this flow at the landed files` (sets the flow's
`store.uses` to `none`), `End every flow at the landed files` (sets the
standard's `store.default` to `none`), and `Add the "<pack>" pack` for each
available pack the standard does not name that has a store method accepting
`files`.

`serve` is chosen like the other actions, from the flow's or transform's
`serve.uses`, the standard's `serve` rules and default, then the packs' rules
and default, for the table's last step: its store step, or its ingest step
when the table ends at the landed files. Its facts are the table's own, as
for its other steps (a flow table's connection `connectivity` and `connector`,
and `layer`), with `input` what that step produces. When nothing chooses a serve method, the table has
no serve step and nothing is reported. A serve method MUST accept what the
last step produces (`HANDOVER`). A serve method with `needsOutput` MUST follow
a step that records an `output` (`HANDOVER`, at the table:
`"<serve>" reads where "<step>" puts its data, and "<step>" does not say.`).
`none` is not a serve choice (`UNKNOWN_METHOD`).

**Runs on.** An environment MAY name `runs-on`, a pack (config specification,
section 3). It MUST be one of the standard's packs (`UNKNOWN_PACK`, at
`runs-on` in project.yaml, with a fix adding the pack when it is available).
In that environment:

- An ingest step whose method produces `files` and belongs to another pack is
  replaced by the named pack's first ingest method with `reads: landed`, which
  reads the files that method would have landed from its own settings. Its
  settings come from the standard and platform under its name; the replaced
  method's are not used, the standard's `allowed` list does not apply to it,
  and a fix adding its missing settings writes them in the standard. Its
  `chosenBy` is `{ by: runs-on, pack: <pack> }`. When the named pack has no
  such method, the step is `RUNS_ON`, an error at the flow's `source`.
- A store or transform step whose method belongs to another pack is
  `RUNS_ON`, an error at the table: local runs need the table's store and
  transforms to be the named pack's.
- A table whose ingest produces `table` and belongs to another pack is left
  out of that environment's
  model, with `RUNS_ON_SKIPPED`, a warning at the table; a transform that
  reads a table left out is left out too, with the same warning.
- A serve step whose method belongs to another pack is dropped.

Environments without `runs-on` are unchanged.

**Landed snapshot.** The default single file of a table that each load
replaces is `<landing>/<object>/<object>.<extension>`. Packs that land or
read whole tables use this path, so they agree without depending on each
other.

These two problems carry fixes (as in the config specification, section 6.1),
one pair for each other ingest method of the standard's packs that can read
the connection, in pack order:

- `Use "<method>" for this flow`: sets the flow's `ingest.uses`.
- When a standard rule chose the method, `Use "<method>" in the standard's
rule`: sets that rule's `use`. Otherwise `Use "<method>" for every <value>
source`: adds a rule at the end of the standard's `ingest.when` matching the
  connection's connectivity (for `CONNECTIVITY_NOT_SUPPORTED`) or connector.

Then, for each ingest method of an available pack the standard does not name
that can read the connection: `Add the "<pack>" pack and use "<method>" for
this flow`, which adds `<pack>@<version>` to the standard's `packs` and sets
the flow's `ingest.uses`.

## 5. Tables, layers and names

- Flow tables are named by their key and land in the flow's `layer`, else
  the first layer. A transform's table is named by its id and lands in its
  `layer`, else the second layer (the first if there is only one). A layer
  that is not in the list is `UNKNOWN_LAYER`.
- Each name is rendered from its Liquid pattern with the variables
  `project`, `environment`, `layer`, `table`, `flow` (flow tables) and
  `source` (the connection id, flow tables). A pattern that does not render
  is `BAD_PATTERN`. Each rendered name MUST match `^[a-z_][a-z0-9_]*$`
  (`BAD_NAME`), and full names `catalog.schema.table` MUST be unique
  (`DUPLICATE_NAME`).
- Two tables MUST NOT have the same table name (`DUPLICATE_TABLE`), since
  transforms refer to tables by name.
- A transform's inputs MUST be tables of the project (`UNKNOWN_INPUT`) and
  MUST NOT depend on the transform itself (`INPUT_CYCLE`). Tables are
  listed with every input before its readers, otherwise in path order.

## 6. Contracts and quality

- A table's contract is the ODCS document it links to. The contract's
  `schema` entry whose `name` equals the table's name is used, or the only
  entry when there is one (`CONTRACT_TABLE` otherwise).
- Each property becomes a column: its type is `physicalType`, else the type
  for its `logicalType`; its `physicalName`, when given, is its name at the
  source, while the table keeps its `name`; it is not nullable when `required` is true; the
  primary key is the properties with `primaryKey: true`, ordered by
  `primaryKeyPosition`.
- Each required column adds the expectation `<column>_not_null` with check
  `` `<column>` IS NOT NULL `` and the quality `required` action, before the
  table's own expectations, which use the quality `default` action when
  they name none.

- A contract's `quality` rules that hold for every row become expectations,
  after the required checks and with the quality `default` action, named by
  the rule's `name`, else `<column>_<metric>` in lower case, with `_2`, `_3`
  added to a name already taken. A rule holds for every row
  when it allows none (`mustBe: 0`, `mustBeLessOrEqualTo: 0`, or
  `mustBeLessThan: 1` counting rows) and is a column's `library` rule:
  `nullValues` is `` `<column>` IS NOT NULL ``; `missingValues` is
  `` `<column>` NOT IN (<values>) ``, and also not null when its values list
  `null`, else allowing null; `invalidValues` with `validValues` is
  `` `<column>` IN (<values>) `` and with `pattern` is
  `` `<column>` RLIKE '<pattern>' ``, each allowing null. A column's
  `logicalTypeOptions` are expectations too, before its rules and with the
  same action, each allowing null and named `<column>_<option>` in snake
  case: `minLength` and `maxLength` compare `length(<column>)`; `pattern` is
  `RLIKE`; `minimum`, `maximum`, `exclusiveMinimum` and `exclusiveMaximum`
  compare the value (a date's as text the platform converts); `multipleOf`
  is `<column> % <n> = 0`; `minItems` and `maxItems` compare `size(<column>)`;
  `uniqueItems: true` is `size(array_distinct(<column>)) = size(<column>)`.
  `format` and the other options are documentation. Any other rule
  except `text` is a **table check** when it is a `library` rule
  (`nullValues`, `missingValues`, `invalidValues`, `duplicateValues`,
  `rowCount`) or an `sql` rule with a comparison: it compares a count over
  all rows after each refresh. A column's `unique: true` is the table check
  `duplicateValues` must be 0. Table checks run only when the platform turns
  on `manage.checks` (section 7.1); otherwise each is
  `QUALITY_RULE_NOT_CHECKED`, a warning at the rule with a fix that turns
  checks on. A `custom` rule is `QUALITY_RULE_NOT_CHECKED` always: Ingestron
  does not run other engines. A table check fails with the quality `default`
  action, except that `drop` warns, since no row can be dropped after the
  refresh.
- On a table that ends at the landed files, nothing checks rows: each of its
  contract's quality rules except `text`, and each of the flow table's
  `expectations`, is `QUALITY_RULE_NOT_CHECKED`, a warning at the rule or
  expectation, and no other quality problem is reported for it. Required
  columns are not reported.
- A contract's object `tags`, a column's `tags` and its `classification` are
  kept on the contract and its columns for packs that tag tables.

An ingest method that `renames` hands over columns under their contract
names; its step records `renamed: true`, so the step that reads them does
not rename again.

Each pack declares, as data (`contract`), what it does with each ODCS field,
by field path (`schema.*.properties.*.physicalName`, `*` for any item):
`used` with what it does, `not-yet` with the reason, `elsewhere` with the
reason when another pack or step handles it, or `documentation` for fields
that never affect what is generated. A path takes its own declaration, else
that of the nearest path above it that is not `used`, or is `used` with
`whole: true` (the fields under it are read as part of it). Every ODCS field MUST
be covered for every pack.

A contract that a table uses and that writes a field that none of the
standard's packs declares `used`, and at least one declares `not-yet`, is
`CONTRACT_FIELD_UNUSED`, a warning at that field, with each pack's reason.

## 7. Platform defaults

| Setting              | Default                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `mode`               | `production` when the environment is `prod` or `production`, else `development` |
| `compute.serverless` | `true`                                                                          |
| `schedule.timezone`  | `UTC`                                                                           |
| `schedule.paused`    | `true` unless `mode` is `production`                                            |
| `manage.schemas`     | `false`                                                                         |
| `manage.tags`        | `false`                                                                         |
| `manage.comments`    | `false`                                                                         |
| `manage.checks`      | `false`                                                                         |
| everything else      | empty                                                                           |

Loading without an environment uses the environment name `default`.

### 7.1 Capabilities

Some features change shared objects on the platform, such as schemas, tags
and comments, so each is a **capability** that the platform turns on with
`manage.<capability>` and that needs privileges someone must grant. Each pack
declares its capabilities as data: an `id` (the `manage` key), a `title`,
what it `does`, and what it `needs` on the platform, in words.

A contract field a pack declares `used` may name the capability it `needs`.
When a contract that a table uses writes such a field and the capability is
off, that is `CAPABILITY_OFF`, a warning at the field naming the capability,
what it needs, and a fix that sets `manage.<capability>: true` in the
platform. Grants in the platform with `manage.schemas` off are
`CAPABILITY_OFF` at `grants`, with the same fix.

## 8. Conformance

Each case in [conformance/](conformance/) gives `files` (the project), an
optional `environment`, and `expect`: `tables` (partial objects, in order,
with `fullName` written as `catalog.schema.table`), `platform`, `names` or
`diagnostics` (matched in order on the fields given; `fixes` lists the fix
titles), and optionally `fixed`, as in the config conformance cases. All cases use the
data-only packs [conformance/pack.yaml](conformance/pack.yaml),
[conformance/pack-bridge.yaml](conformance/pack-bridge.yaml) and
[conformance/pack-local.yaml](conformance/pack-local.yaml), all available.

## Connector authoring metadata

A connector's settings metadata may mark a field `optional`, give its primitive
`type` (`text`, `number`, or `object`), and list allowed text `values`. Absence of
`optional` means required for the connector's default authentication path;
conditional fields explain the condition in their description. Snippets include
only that default path's required fields. This metadata describes authoring;
the selected method still validates the resolved definition.

When connector IDs appear in several packs, authoring uses the resolved ingest
method to choose settings. If resolution is unavailable, a unique connector
compatible with the connection's connectivity may be used. Ambiguous candidates
must not silently use the first pack's fields. Settings-block suggestions may
present the explicitly labelled alternatives.

Connector metadata may include `category`, a discovery label used by project
creation and reference navigation. It does not change routing or validation;
method connector and connectivity capabilities remain authoritative.

A connector may expose `reading` metadata for a native table reader: `query`
(`required`, `optional` or `unsupported`), the accepted `sourceOptions` names,
its landing `format`, and an optional required `runtime`. Packs derive these
facts from the same source definitions used for validation. Documentation uses
them to select the applicable method settings; they introduce no YAML fields
or new extraction behaviour.
