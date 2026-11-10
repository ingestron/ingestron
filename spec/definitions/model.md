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
and these kinds, all `apiVersion: ingestron.io/v1` except contracts and data
products:

| Kind           | Schema                                         | Links                                                       |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `Standard`     | `standard.schema.yaml`                         |                                                             |
| `Platform`     | `platform.schema.yaml`                         |                                                             |
| `Connection`   | `connection.schema.yaml`                       |                                                             |
| `Flow`         | `flow.schema.yaml`                             | `/source` → Connection; `/tables/*/contract` → DataContract |
| `Transform`    | `transform.schema.yaml`                        | `/contract` → DataContract                                  |
| `DataContract` | ODCS v3.1.0 (`apiVersion: v3.1.0`)             |                                                             |
| `DataProduct`  | ODPS v1.1.0 (`apiVersion: v1.0.0` or `v1.1.0`) | `/outputPorts/*/contractId` → DataContract                  |

A project MUST have exactly one `Standard` (`NO_STANDARD`, `MANY_STANDARDS`)
and at most one `Platform` (`MANY_PLATFORMS`). The standard's `packs` list
names the packs to use, `<id>@<version>`. Each MUST be available
(`UNKNOWN_PACK`) in that major version (`WRONG_PACK`), and two packs MUST NOT
have a method of the same name (`METHOD_CONFLICT`).

A standard that names version 1 of a pack available as version 2 is
`PACK_VERSION` instead of `WRONG_PACK`: an error at the reference, with the
message
`This standard is for "<id>@1", but the pack is <id>@2, which builds every environment into one output folder.`
when version 2 builds environments together (section 2.1), and
`This standard is for "<id>@1", but the pack is <id>@2.` when it does not;
the hint `Change it to <id>@2; the upgrade notes say what changes in the generated files.`;
and one fix, `Change to "<id>@2"`, which sets the reference to `<id>@2`. Any
other version that is not available stays `WRONG_PACK`, such as version 3 of
a version 2 pack, or version 1 of a version 3 pack.

Two placeholder forms exist. A `${…}` reference is replaced wherever text is
written, project.yaml's values included, by the `@ingestron/config` syntax.
A `{{ … }}` pattern is replaced only in a standard's or platform's `naming`
and in a transform's `code`, where per-table names such as `table` and
`layer` exist. A `{{ … }}` anywhere else in project.yaml or a document other
than a contract stays as written: that is `PLACEHOLDER_NOT_REPLACED`, a
warning at the text, with a fix to the `${…}` form when there is one:
`{{ environment }}` (or `env`) is `${environment.name}` and `{{ project }}`
is `${project.id}`.

The text `REPLACE_ME` stands for a value that only the project's owner knows,
such as a host, a storage account or a source table; `ingestron init` writes
it where it cannot know the value. For the selected environment, every text
value of every loaded document is checked after its `${…}` references are
replaced, text read with `${file:…}` included, and so is each
`${values.<name>}` a transform's `code` still holds, as its value. A value
that contains the exact, case-sensitive text `REPLACE_ME` anywhere is
`REPLACE_ME`: a warning, or an error when the project is resolved with the
option `replaceMe: "error"`, as `ingestron check` resolves it. Keys,
comments, and project.yaml values that no document reads are not checked.
There is no escape.

It is reported once for each place where the text was written, which is the
first of these that holds it:

1. the document's own text at the value;
2. a project.yaml value that this text reads with `${values.<name>}`: the
   selected environment's value under `environments.<environment>.values`
   when it has one, else the top-level `values`; a project.yaml value that
   reads another value is followed the same way;
3. the file that a `${file:…}` in this text reads, at the first line that
   holds the text;
4. a `${envvar:…}` reference in this text, at the reference.

The message is `<field> is still REPLACE_ME: write the real value before deploying.`,
where `<field>` is, as a platform request writes it, the keys of the value's
JSON Pointer joined with `.`, such as `settings.server`; for a project.yaml
value it is `values.<name>`, such as `values.storage_account`. The hint is
`Ingestron cannot know this value. The comment above it says what it is; README.md says where to find it. A value that differs per environment goes in project.yaml under environments.<name>.values.`
It has no fix.

`REPLACE_ME` is a known value, not an unset reference: every other check runs
on it, and `deployTime` (section 1.1) changes nothing. One exception keeps a
new project resolving: a method's settings check leaves out a failure whose
failing value is text that holds `REPLACE_ME`, other than a `type` failure,
as it leaves out one an unset reference causes (below), because the
`REPLACE_ME` diagnostic reports that value. So `REPLACE_ME` in a name whose
pattern allows no `_`, such as an integration runtime's, is reported once, as
`REPLACE_ME`.

A transform's `code` read with `${file:…}` is text, which the loader leaves
as written. Resolution replaces each `${values.<name>}` still in the code
(`<name>` may be a dotted path) with the environment's value, as the loader
does for code written inline; so in code, `$${values.<name>}` cannot keep
that text. Any other `${…}`, such as a SQL parameter, stays as written. A name with no value is
`UNKNOWN_CODE_VALUE`, an error at the code, listing the names that exist.

A problem is an error, a warning or information: a project resolves when it
has no errors, and its warnings and information, including those found while
loading, are reported with the model. Every problem is reported with the location of the value that caused it (for a method nobody named, such as a pack's default, the
flow's `source`, or its `store` when it has one), and
resolution continues so that all problems are found in one run. A problem
written once, such as on a flow shared by several tables, is reported once.

Loaded with `missingEnvvars: information`, as an editor loads it, a project
MAY hold unset references: the text of `${envvar:…}` references whose
variable is set nowhere ([configuration specification](../config/syntax.md),
section 5.1). A value that holds one is not known yet, so it causes no error
or warning by itself, and resolution goes on as if it were right:

- A method's settings are checked against its schema as the loader checks a
  document (configuration specification, section 5.1). A failure whose
  failing value is text that holds an unset reference is left out, except a
  `type` failure. A `oneOf`, `anyOf` or `if` failure is left out, with every
  failure inside it, when one of its alternatives failed only in ways left
  out. Every failure that remains is reported as `BAD_SETTING`, wherever it
  is. So an unset reference where a number or a list is needed is an error,
  as it is for the loader: a variable's value is always text.
- A setting that holds an unset reference never changes a `fixed` value
  (`FIXED_SETTING`).
- A name pattern that gives text holding an unset reference is not checked
  for its characters (`BAD_NAME`).
- A reference that holds an unset reference names something not known yet,
  and is never reported as not found. A flow's or transform's `layer` is the
  text as written. A flow's `source` names a connection that is not known,
  and the table records that text as `sourceNotKnown`; see the next item.
  The ingest method's `connectors` and `connectivity` are not checked against
  a connector or connectivity that holds an unset reference. Any other
  reference that holds one, a `uses`, a table's `contract` or a transform's
  `inputs`, names what the table is made from, so that table is left out,
  and so is any transform that reads it. The `ENVVAR_MISSING` information at
  the reference says why.
- For a flow whose `source` holds an unset reference, which method ingests
  depends on the connection, so it is known only when the flow names it with
  `ingest.uses`. Then the table's connection has the source's text as its
  `id`, `connector` and `connectivity`, and no settings; no `when` on a
  connector or connectivity matches it, and the steps resolve as usual.
  Otherwise the ingest method is not known, and nor are the steps after it,
  which depend on what ingest hands over: the table has no ingest, store or
  serve step. None of their settings are checked (their schema, missing
  settings and `SETTINGS_UNUSED`), which counts as a problem left out. The
  table stays, with its name, layer and contract. Files are never generated
  from a table with `sourceNotKnown`: its connection is a stand-in, and its
  steps may be missing. An editor that previews the generated files shows
  instead that the source is not known.
- Apart from `BAD_SETTING`, no problem is reported where a text value that
  holds an unset reference was written. Such a problem is **left out**.
- A method's `check` is not run on a table that holds an unset reference
  anywhere: what such a check judges cannot be told apart from the rest of
  what it is given. A pack's `check` is not run on a model that holds one,
  nor when any problem was left out, because a table may then be missing.

The loader's `ENVVAR_MISSING` information says what is missing. A project
without unset references is resolved as described everywhere else.

### 1.1 Deploy-time values

Resolved with `deployTime: true`, as it is for the packs that build
environments together (section 2.1), a project is loaded with the
configuration option `deployEnvvars` (configuration specification, section
4.4). Every `${envvar:NAME}` reference is then a **deploy-time value**: a value
that the pipeline deploying the generated files supplies. It is never read
from the host environment or an environment file, so the files are the same
on every computer and in CI. No `ENVVAR_MISSING` is reported. Its text in the
model is `${envvar:NAME}`, written without spaces: an unset reference, so
section 1's rules apply to it, except where this section says otherwise.

What it holds is known only when deploying, so a check MUST NOT judge a
deploy-time value's content: a problem at a value that holds one is left out,
so validation that depends on the value, such as a pattern, is the platform's
when deploying. A `type` failure in a method's settings is still
`BAD_SETTING`. Every other check runs, treating the text as it is: each
method's `check` runs on every table, and each pack's `check` on the model,
whatever deploy-time values they hold, and a pack's or method's `check` MUST
NOT judge the content of a deploy-time value's text. A setting that holds a
deploy-time value where the standard fixes the key is `FIXED_SETTING`, as any
other value that differs from the fixed one.

What is generated, and every name, are decided when generating. So a
deploy-time value MUST NOT be in these values: it is `DEPLOY_VALUE`, an error
at the value, for each one that holds a deploy-time value:

- every document's `id`;
- a Connection's `connector`, `connectivity` and `timezone`;
- a Flow's `source`, `layer`, `ingest.uses`, `store.uses` and `serve.uses`, and
  each table's `contract`;
- a Transform's `layer`, `contract`, each of its `inputs`, and its
  `transform.uses`, `store.uses` and `serve.uses`;
- a Standard's `packs`, `layers` and `naming`, and in each action its
  `default`, `allowed`, and each `when` rule's facts and `use`;
- a Standard's `features`, `load.default`, `load.deletes`, each `load.when`
  rule's facts and `use`, each layer's `history`, `storage.features`, and the
  same values under `fixed` (`history`, `load.mode`, `load.deletes.mode`,
  `storage.features`);
- a Flow's, a flow table's and a Transform's `history`, and a Flow's and a
  flow table's `load.mode` and `load.deletes.mode`;
- a flow table's and a Transform's column `timezone` (`from` and `to`), and a
  Standard's `cleanse.timestamps.to`;
- a Platform's `naming` and `mode`, and `mode` in its `databricks` section
  (section 7);
- a DataProduct's output ports' `contractId`.

Any other error that section 1 would leave out at a value that holds a
deploy-time value is `DEPLOY_VALUE` at that value too, except `BAD_SETTING`
and `FIXED_SETTING`. A warning there is left out, as in section 1. The
message is `"${envvar:NAME}" is supplied only when deploying, so it cannot decide what is generated or what it is called.`,
naming the first deploy-time value the value holds, and the hint is
`Write this value in project.yaml, per environment; keep ${envvar:…} for values the deploying pipeline supplies, such as hosts, paths and accounts.`

The model lists its deploy-time values in `deployValues`, one per `NAME`, in
the order first resolved. Each has its `name`, its `text` (`${envvar:NAME}`)
and its `uses`: the `file`, `pointer` and, when known, `line` of each value it
feeds, as the loaded project's `envvarReferences` give them (configuration
specification, section 4.6), leaving out each whose value the environment
overrides, so that the resolved value there does not hold the text. A
deploy-time value with no use left, such as a default that every
environment's own value replaces, is not listed. A model resolved without `deployTime` has no
`deployValues`, and reads `${envvar:…}` as the rest of this specification
says. As for any unset reference, text is matched as written: text kept with
`$${envvar:NAME}` for a `NAME` that is also a deploy-time value reads as that
value.

### 1.2 What a warning is about

A warning that resolving reports MAY carry a `subject`: `{ table, feature }`,
each optional, saying what it is about, so that a warning can be told apart
from another with the same code.

- `table` is the name of the table the warning is about. Every warning
  reported while one table is resolved (from its flow table or transform,
  its contract and its intent) has it, as does `RUNS_ON_SKIPPED` for a
  transform left out with its input, `NOT_APPLIED` for a contract field
  (section 6), and `CAPABILITY_OFF` for a contract field that only one table
  uses (more than one table, and it has none, as for any warning found for
  several tables).
- `feature` is set on `NOT_APPLIED` and `CAPABILITY_OFF` only. For
  `CAPABILITY_OFF` it is the capability's id (`tags`, `schemas`, `comments`,
  `checks`, `grants`, `masks`, `filters`). For `NOT_APPLIED` it is one of:
  - an intent value, as coverage keys it (section 11.5): `<path>=<value>`,
    such as `history=full` or `audit=run_id`, or the path alone for a path
    whose value is any text, such as `load.cursor`, or for a setting that
    decides a whole path (section 11.4); a table's `quality.results: true` is
    `quality.results=true` (section 11.6);
  - a rule kind (`notNull`, `in`, `notIn`, `pattern`, `length`, `range`,
    `multipleOf`, `items`), an action (`warn`, `drop`, `fail`),
    `table-checks`, or `expectations` for a check a flow table writes itself
    (sections 6 and 11.7); a table check that counts values against a
    `pattern` is also judged as the rule kind `pattern` (section 11.7);
  - a cleansing operation, `cleanse.trim`, `cleanse.empty`, `cleanse.map`,
    `cleanse.case` or `cleanse.default` (section 6.1), a time zone
    conversion, `cleanse.timezone` (section 6.3), or `deduplicate`
    (section 6.2);
  - `quarantine`, for a table's `quality.quarantine` (section 11.7);
  - for access (section 8.2), `grants` for a role's grant, `write` for a
    role's write access, `exact` for exact grants, `masks` for a column's mask
    and `filters` for a row filter;
  - a contract field path, such as `schema.*.properties.*.encryptedName`
    (section 6).

Errors, and warnings from loading (the configuration specification), carry no
subject. Two warnings that differ only in their `table`, such as one at a
flow's setting found for each of its tables, are one warning, kept once and
without `table`, since it is about more than one table. So a warning at a
place several tables share, such as the standard's `quality.default`, has a
`table` only when one table reaches it.

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
fixes never offer it; only an environment that runs on its pack chooses it
(section 4, "Runs on"). Chosen any other way, by a definition, a rule or a
default, it is `RUNS_ON`, an error at the choice.

Each method has an `action`, the `connectors` it reads and the
`connectivity` it supports (ingest), what it `accepts` (transform, store)
and `produces` (`files`, `table` or `query`), `defaults`, a JSON Schema
for its `settings`, and optionally `placement`: which settings belong in the
platform (`platform`, such as shared infrastructure) or the standard
(`standard`, such as a schedule); the others belong in the definitions. A
method MAY also give `intentDefaults`, the intent it applies when nothing
declares it (section 11.3), and `aliases`, the settings that are other names
for intent (section 11.4).

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

### 2.1 Building files

A pack builds files from resolved models: path → text, relative to the pack's
output folder, each path as the generation specification requires
([section 2](../generate/behaviour.md#2-paths)).

- `build(model)` gives the files for one environment. Every pack has it. A
  pack that builds environments together MUST also accept a model resolved
  with `deployTime` (section 1.1), writing each deploy-time value's `text` as
  it is.
- `buildEnvironments(models)` is optional. It gives the files for every
  environment at once: one artefact that covers them all, such as one
  Databricks bundle with a target per environment. A pack that has it
  **builds environments together**.

An environment is a **target** of a pack when its model has a step (`ingest`,
`transform`, `store` or `serve`) whose `pack` is that pack's id. So an
environment that runs on another pack (section 4, "Runs on") is usually not a
target. A pack with no target builds nothing. `models` maps the name of each
target to its model, in the order project.yaml declares the environments,
each resolved with `deployTime` (section 1.1). The models given to `build`
by a tool that generates are resolved without it.

`buildEnvironments` returns:

- `files`: the files, covering every target;
- `deployValues`: for each deploy-time value the files take, its `name` and
  `suppliedAs`, the names under which the deploying pipeline supplies it,
  such as `BUNDLE_VAR_landing`. They are in the order the values first appear
  in the models, taken in target order, and a value the files do not use is
  left out;
- `problems`: what stops the files covering every target, or is worth
  knowing. Each has a `code`, a `severity` (`error` or `warning`), a
  `message` (one or more sentences), the `file`, and when known the `line`,
  of the definition that causes it (for a `PACK_NOTICE`, only when one
  does), and optionally a `hint` in place of the code's. When there is an
  error, the files MUST NOT be written. Whether there is one is decided on the
  diagnostics the problems become (below), so a `PACK_NOTICE` never stops the
  files being written, whatever severity it gives.

A pack reports only these codes:

| Code                  | Severity | When                                                                                  |
| --------------------- | -------- | ------------------------------------------------------------------------------------- |
| `ENVIRONMENTS_DIFFER` | error    | Targets differ in more than values                                                    |
| `DEPLOY_VALUE`        | error    | A deploy-time value is where the platform cannot take it                              |
| `ARM_PARAMETERS`      | error    | The ARM template would have more than 256 parameters; the message gives the count     |
| `SECRET_NAME_DIFFERS` | warning  | A Key Vault secret's name differs between environments, where only the vault should   |
| `PACK_NOTICE`         | warning  | Something about the files the people deploying them need to know, in the pack's words |

**`PACK_NOTICE`.** A pack tells the people who generate and deploy its files
something they need to know, such as a setting it cannot write that the
platform keeps, or a deploy-time value whose name the deploying pipeline must
supply exactly as written. It is always a warning: the files are still
written, and, like every warning, it does not make generating or checking the
definitions fail. It has the pack's `message`, one or more sentences, and a
`hint`, what to do, which the pack MUST give, since the code has no hint of
its own. Its `file` and `line` are optional: the pack gives them when one
definition causes the notice, and leaves them out when it is about the files
as a whole. A `line` is given only with a `file`; without one it is not used.
Each pack's specification lists its notices, with each message.

A pack that builds environments together MUST:

1. write each value that is the same in every target as it is;
2. make a value a parameter of the artefact only where it is a deploy-time
   value in some target, or has at least two different values among the
   targets (**minimality**);
3. set every parameter in every target where it is not a deploy-time value,
   and leave it, in the targets where it is one, for the deploying pipeline;
4. write no deploy-time value's `text` in any file it returns;
5. list in `deployValues`, with at least one name in `suppliedAs`, every
   deploy-time value whose `text` is in any target's `render`;
6. give the same files for the same models, whatever the computer, the time
   and the host environment;
7. give valid files for a single target.

**Deploy-time values and parameters.**

- A value that is literal in some targets and a deploy-time value in others
  is one parameter: set as written in the targets where it is literal, and
  left for the deploying pipeline where it is a deploy-time value.
- Different deploy-time values at the same place in two targets, such as
  `${envvar:DEV_HOST}` in dev and `${envvar:PROD_HOST}` in prod, are
  `DEPLOY_VALUE`, with the hint
  `Use one variable name and give it a different value in each pipeline stage.`
- A deploy-time value inside a longer text, such as
  `${envvar:ACCOUNT}.dfs.core.windows.net`, is a parameter for the value
  alone, with the rest of the text literal, where the platform can put a
  parameter inside a text (as Databricks does with `${var.account}`). Where a
  parameter must be a whole value, as an ARM parameter or a SQLCMD variable's
  value is, the pack refuses it with `DEPLOY_VALUE`. Each pack's
  specification says which it does.

**The fold property.** For each target, substituting that target's values into
the folded files gives exactly the files of that target alone, with every
value written as it is. A pack's specification defines, for a target `e`:

- `render(e)`: `build(models[e])`, on the model resolved with `deployTime`:
  the files for `e` alone, every value literal and each deploy-time value as
  its `text`. It is built by `build`, a code path apart from
  `buildEnvironments`, so the property compares two independent results;
- `view(files, e)`: what the platform makes of the folded files for `e` by
  its own deploy-time mechanism, in the layout `build` gives; for example,
  the bundle's target `e` with each `${var.…}` replaced by `e`'s value, an ARM
  template with `parameters/e.json` applied, or `views.sql` with the
  `:setvar` lines of `environments/e.sql`. Each parameter left for the
  deploying pipeline is replaced by its deploy-time value's `text`;
- how two texts at the same path are compared, if not as text; for example
  YAML and JSON as data.

Then, for every set of models, every target `e`, and the models of every
first one, two or more targets in order, `view(buildEnvironments(models).files, e)`
MUST equal `render(e)`, and rules 4 and 5 hold. Each pack tests this on
fixtures of three targets, so of one, two and three, with a value that is the
same in two targets and different in the third. Minimality (rule 2) is
tested in each pack's own terms.

**`ENVIRONMENTS_DIFFER`.** Environments may differ only in values. A pack
reports `ENVIRONMENTS_DIFFER` for each resource that some targets build and
others do not, and for anything else that differs between targets other than
by a value it can make a parameter, such as a method, a step, or code that
differs in more than a value. Its specification lists what it reports, with
each message.

**`DEPLOY_VALUE`.** A pack that cannot take a deploy-time value where it is
used, such as in a name the platform requires to be the same in every
environment, reports `DEPLOY_VALUE`. Its specification lists where. Its
location is the `file` and `line` of the value's `uses`.

Each problem is a diagnostic: its `code`, its `severity`, the pack's
`message`, and the location `file`, `line` (1 when the pack gives none) and
column 1. A `PACK_NOTICE` is a warning whatever severity it gives, and has no
location when it gives no `file`. The hint is the problem's own, else the
code's:

- `ENVIRONMENTS_DIFFER`:
  `Environments may differ only in values, such as names, paths and hosts; make the rest the same in every environment.`
- `DEPLOY_VALUE`: the hint of section 1.1.
- `ARM_PARAMETERS`:
  `Make fewer values differ between environments, or split the definitions into more than one factory.`
- `SECRET_NAME_DIFFERS`:
  `Give the secret the same name in every environment's Key Vault, so that only the vault differs.`

**Comparing targets.** Every pack compares its targets' models the same way,
so the definitions package provides it, as `compareTargets(models)`. The
models are compared as data, leaving out each step's `origins` and
`chosenBy` and the model's `deployValues` and `previewFeatures` (which
follow from the tables' intent, compared with the tables). Tables are matched
by name. It
gives:

- `structural`: an `ENVIRONMENTS_DIFFER` error, in table order then target
  order, for each of these, against the first target that has the table:
  - a table that some targets do not have:
    `Table "<name>" is built in <targets with it> but not in <targets without it>.`,
    at the table's file;
  - a step that some targets do not have:
    `Table "<name>" has a <step> step in <targets with it> but not in <targets without it>.`,
    at the table's file;
  - a step whose method differs:
    `Table "<name>" uses "<method>" for <step> in <first target> and "<method>" in <target>.`,
    at the file and line where the second target's step was chosen, when it
    records one, else at the table's file;
  - a `DEPLOY_VALUE` error with the hint above for each place where two
    targets hold different deploy-time values. Each target's deploy-time
    values at the place are taken in the order the text holds them
    (`splitDeployText`); against the first target that holds any, the first
    other target whose list differs is reported, at the first position where
    both hold a value and the two differ:
    `This value is ${envvar:<NAME>} in <target> and ${envvar:<NAME>} in <target>.`,
    naming those two values, at the first use of the second one. A target that
    holds fewer values there, with literal text in place of one, is not a
    difference of names;
- `differing`: every other place, by JSON Pointer into the first target's
  model, where the targets' values are not all the same, with the value in
  each target that has one. A list whose length differs is one place; so is
  a key that some targets do not have.

Target lists are joined with `, `, the last two with the word `and` between
them. A problem the same as one already given (the same code, message, file
and line), such as for a value two tables share, is given once.

`splitDeployText(text, deployValues)` splits a text into its literal parts
and the deploy-time values in it, in order, leaving out empty parts.
`checkFold(pack, models, { view, same? })` checks the fold property and
rules 4 and 5 for the models of the first one, two and more targets, and
returns a sentence for each failure; none when it holds. A model resolved
without `deployTime` (one with no `deployValues`) is a failure, so rules 4
and 5 cannot hold by having nothing to check.

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
value. A setting that is another name for intent is written from the table's
intent once methods are chosen, and records the intent's origin (section
11.4).

## 4. Choosing a method

For each action of each table:

1. The flow's or transform's `<action>.uses`, if set. It MUST be in the
   standard's `allowed` list when one is given (`METHOD_NOT_ALLOWED`).
2. Otherwise the first matching rule of the standard's `when`, then of the
   packs' `when`. A rule matches when every fact it names equals the table's:
   `connectivity` and `connector` of the flow's connection, `input` (what the
   previous action produces) and `layer`. A standard's rules also match these
   facts of the table:

   - `load` and `history`: the load mode and history the table declares
     (section 11.2). Only intent written as intent counts. A pack's defaults,
     which fill what is left after methods are chosen, are not facts, and
     neither is a method setting that stands for intent (an alias, whose
     meaning depends on the method being chosen). A table that declares none
     has no such fact, and a transform's table has no `load`.
   - `classification`: the highest classification among the columns of the
     contract object the table uses (the schema entry named like the table,
     else the only entry), by the order of the standard's
     `governance.classification.values`. A column whose classification is not
     in the list does not count. Without that list there is no order, so the
     table has no `classification` fact.
   - `tag`: matches when the contract object the table uses has that tag.
     Tags on its columns, and on other objects of the contract, do not count.
   - `product` and `domain`: the id and the `domain` of the first data
     product, in path order, whose output port names the table's contract. A
     table no product publishes has neither.

   A fact the table does not have does not match. A pack's rule is skipped
   when its method cannot read the connection's connector or connectivity, so
   another pack can serve that source.

3. Otherwise the standard's `default`, else the pack's.

Each step records how its method was chosen (`chosenBy`): `by` is
`definition` (the flow's or transform's `uses`), `standard-rule`,
`standard-default`, `pack-rule`, `pack-default` or `runs-on`; a rule's facts are in
`when`; a pack's rule or default names its `pack`; a step chosen by runs-on
names the method it `replaced`; and a choice written in a file gives its
`file` and `line`. Tools use it to explain why a method is
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
changes nothing, and is still subject to `allowed`. When the table ends at the
landed files, store settings written in the flow or on the table are not used
(`SETTINGS_UNUSED`, a warning at them). A `none` from a standard's or pack's rule or default applies only where
ingest hands over `files`, or where that is not known because ingest
failed; elsewhere, such as for a transform, the next matching rule or
default applies. A transform's store choice MUST NOT be `none`
(`HANDOVER`): a transform's query needs a store step. A transform MUST NOT
read a table that ends at the landed files (`HANDOVER`, at the input):
there is no table to read.

When nothing chooses a store method and ingest hands over `files`, the problem
is `UNKNOWN_METHOD` at the flow (when ingest failed, its own problem is
enough), with fixes: `End this flow at the landed files` (sets the flow's
`store.uses` to `none`), `End every flow at the landed files` (sets the
standard's `store.default` to `none`), and `Add the "<pack>" pack` for each
available pack the standard does not name that has a store method accepting
`files`.

`serve` is chosen like the other actions, from the flow's or transform's
`serve.uses`, the standard's `serve` rules and default, then the packs' rules
and default, for the table's last step: its store step, or its ingest step
when the table ends at the landed files. Its facts are the table's own, as
for its other steps (a flow table's connection `connectivity` and `connector`,
and `layer`), with `input` what that step produces. When nothing chooses a
serve method, the table has no serve step; serve settings written in the flow
or on the table are then not used (`SETTINGS_UNUSED`, a warning at them).
`none` written as a flow's or transform's `serve.uses` means no serve step,
whatever the standard chooses; it is subject to `allowed`. A serve method MUST
accept what the last step produces (`HANDOVER`). A serve method with
`needsOutput` MUST follow a step that records an `output` (`HANDOVER`, at the
flow's or transform's `serve` when it chose the method, else at the table:
`The serve step "<serve>" reads where "<step>" puts its data, and "<step>" does not say.`).

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
  `chosenBy` is `{ by: runs-on, pack: <pack>, replaced: <method> }`, and it is `renamed` when the
  replaced method renames, since the files hold that method's names. When the named pack has no
  such method, the step is `RUNS_ON`, an error at the flow's `source`.
- A store or transform step whose method belongs to another pack is
  `RUNS_ON`, an error at the table: local runs need the table's store and
  transforms to be the named pack's.
- A table whose ingest produces `table` and belongs to another pack is left
  out of that environment's
  model, with `RUNS_ON_SKIPPED`, a warning at the table; a transform that
  reads a table left out is left out too, with the same warning.
- A serve step whose method belongs to another pack is dropped.
- A table that ends at the landed files (`store: none`) still ends there; its
  ingest is replaced as above, and the environment builds nothing for it.

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
  that is not in the list is `UNKNOWN_LAYER`. A layer in the list is its name
  or an object with a `name` (section 11.1); the layers are the names, in
  order. Layer names MUST be unique: a name listed again is
  `DUPLICATE_LAYER`, an error at the second item.
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
- A transform with exactly one input MAY leave out `code`. Its code is then
  `SELECT * FROM {{ tables.<input> }}`, and everything else is as if it had
  been written, so a pack keeps the contract's columns. A transform without
  `code` and with any other number of inputs is `TRANSFORM_CODE`, an error at
  the transform's `inputs`. The message is
  `"<id>" has no code, which a transform may leave out only with one input; it has <n>.`
  and the hint is `Write the code, or give the transform one input.`

**Layer duties.** A layer written as an object MAY give `does` (section
11.1): `raw`, or a list of `cleanse`, `deduplicate`, `check` and
`quarantine`. A table's `does` is its layer's, `"raw"` or the list as
written. A table whose layer gives none has no `does`, and resolves exactly
as it did before layers could say what they do; so do the tables of a
standard that gives none.

- **Actions.** When a table has `does` and it does not list `check` (`raw`
  always does not), every action of its checks is `warn`: a required
  column's, the standard's `quality.default` and `quality.required`, a flow
  table's or transform's own, and a table check's. The table keeps every
  row, and its checks count. A default is never an error here; it only
  becomes `warn`. A pack that counts checks only where a layer checks
  (`onlyWhere: check`, section 11.7) counts them in a `raw` layer too: there
  every action is `warn`, so counting is all `check` asks. A list that leaves
  out `check` has no such meaning, and its checks are not counted there.
- **`LAYER_RESPONSIBILITY`.** A setting that asks for a duty the table's
  layer does not do is an error at the setting, whenever the table has
  `does` and it does not list the duty: `drop` or `fail` written as the
  action of a flow table's or transform's own expectation needs `check`;
  cleansing needs `cleanse`, `deduplicate` needs `deduplicate` and
  `quarantine` needs `quarantine`. The message names the layer, the duty
  and the setting:
  `The layer "<layer>" does not list <duty> in its does, so <what> cannot be set here.`
  Here `<what>` says what was written, such as `a "drop" action`. The hint names
  the layers whose `does` lists the duty, in the standard's order:
  ``Layers that do <duty>: <names>. Or add `<duty>` to this layer's `does`.``
  When no layer does, it is ``Add `<duty>` to the layer's `does`.`` A layer with no
  `does` asks nothing of its tables.

**Layer access.** A layer written as an object MAY give `access`, who may use
its tables (section 8.2): `contract: false` grants none of the contracts'
roles on the layer's tables (the default, `true`, grants them), and `roles`,
a list of `{ role, access }`, is granted on every table in the layer, beside
the contract's. A role's `access` is `read` (the default) or `write`.

**Transform columns.** When a transform's code is SQL whose outermost
`SELECT` names every column it returns (each an identifier, `table.column`, or
an expression with `AS <name>`; no `*`), those names are compared with the
contract's, ignoring case and quotes. A returned column the contract does not
name is `TRANSFORM_COLUMNS`, a warning at the code: `"<column>" is returned,
but the contract <id> does not name it.` (whether it is kept depends on the
pack: DuckDB and Synapse select only the contract's columns). A contract column the query does not return
is the same warning: `The query returns no column "<column>", which the
contract <id> names.` Code that is not SQL, or whose columns cannot be read
this way, is not compared.

## 6. Contracts and quality

The quality `required` and `default` actions below are the standard's, over
which those of the table's layer apply (section 11.2).

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
  `duplicateValues` must be 0. Table checks run, for each table that uses the
  contract, as the pack that keeps the table allows (section 7.1): always
  when that pack declares no `checks` capability, else only when the
  platform turns on `manage.checks`; otherwise each is `CAPABILITY_OFF`, a
  warning at the rule (feature `checks`) with a fix that turns checks on:
  `<rule> rule compares a count over all rows, which is checked after each
refresh only when manage.checks is on.`, where `<rule>` is `"<metric>"` or
  `A <type>`. A column's `unique: true` that does not run this way is
  `CAPABILITY_OFF` at its `unique`, about that table, with the message and
  hint of a contract field that needs `checks` (section 7.1), and is listed
  as a rule not checked, named `<column>_unique`. A `custom` rule is
  `QUALITY_RULE_NOT_CHECKED` always: Ingestron
  does not run other engines. So is any other rule that is neither a check
  of each row nor a table check, such as one with no comparison: it cannot
  be checked as written. A table check fails with the quality `default`
  action, except that `drop` warns, since no row can be dropped after the
  refresh. Whether the pack that keeps the table applies each rule kind,
  action and table check is judged as section 11.7 says.
- On a table that ends at the landed files, nothing checks rows. Each of its
  contract's quality rules that is a check of each row or a table check, and
  each of the flow table's `expectations`, is `NOT_APPLIED`, a warning at the
  rule or expectation, on the pack of the table's ingest step, whatever any
  pack says, with the hint `Add a store step to have it checked.` The
  messages are, for a rule (`<type>` in place of `"<metric>"` for a rule with
  no `metric`) and for an expectation:

  ```text
  The "<metric>" rule isn't applied on <pack>: the table ends at the landed files, and nothing checks them.
  Expectation "<name>" isn't applied on <pack>: the table ends at the landed files, and nothing checks them.
  ```

  Its feature (section 1.2) is the rule's kind for a check of each row,
  `table-checks` for a table check and `expectations` for the flow table's
  own. A rule that cannot be checked as written is `QUALITY_RULE_NOT_CHECKED`
  as above, and a `text` rule is not reported. No other quality problem is
  reported for the table, and required columns and `logicalTypeOptions` are
  not reported.

- Each expectation made from a contract (a required column, a row rule or a
  `logicalTypeOptions` option) also carries `rule`, the same check as data a
  pack can write in its own SQL; `check` keeps the Spark SQL text above,
  unchanged. An expectation written in a flow or a transform has no `rule`.
  A `rule` has a `kind` and the column's name without quotes:

  | `kind`       | Fields                      | Made from                                                                                                                                      |
  | ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `notNull`    |                             | a required column; `nullValues`; `missingValues` listing only `null`                                                                           |
  | `in`         | `values`, `allowNull: true` | `invalidValues` with `validValues`                                                                                                             |
  | `notIn`      | `values`, `allowNull`       | `missingValues`: `allowNull: false` when its list names `null` (then `values` are the others), else `true`                                     |
  | `pattern`    | `pattern`                   | `invalidValues` with `pattern`; option `pattern`                                                                                               |
  | `length`     | `min`, `max`                | options `minLength`, `maxLength` (one each)                                                                                                    |
  | `range`      | `min` or `max`, `exclusive` | options `minimum`, `maximum` (`exclusive` left out) and `exclusiveMinimum`, `exclusiveMaximum` (`exclusive: true`); a date's limit is its text |
  | `multipleOf` | `value`                     | option `multipleOf`                                                                                                                            |
  | `items`      | `min`, `max`, `unique`      | options `minItems`, `maxItems`, and `uniqueItems: true` as `unique: true`                                                                      |

  Each option is its own expectation, so a `length`, `range` or `items` rule
  holds one limit and leaves the other fields out. An option whose value is
  not of the type ODCS gives it (such as `minLength: "2"`, which the ODCS
  schema refuses when the contract loads) makes an expectation with no
  `rule`, and a pack uses its `check`. The `values` of
  `in` and `notIn` are compared as the `check` text compares them: a number
  as it is, and any other value, `null` and booleans among them, as its text
  (`validValues: [true, null]` gives `values: ["true", "null"]`).
  A row passes a rule only when the rule is true for it: a null column value
  fails `notNull`, passes `in` and `notIn` when `allowNull` is true, fails
  them when it is false, and passes every other kind. The `check` text
  gives the same answer for every row and is never null. A pack that reads
  `rule` MUST keep that meaning, so a null never counts as a pass by
  accident of how the engine treats an unknown result. Databricks does not
  say what its expectations do with a check that is null: its expectations
  page (https://learn.microsoft.com/en-us/azure/databricks/ldp/expectations,
  read 2026-11-10) says only that the constraint "must evaluate to true or
  false for each record" and that a record that "fails this condition"
  triggers the expectation. Ingestron's checks are written so that none is
  ever null, and the meaning above does not depend on what Databricks does
  with one.

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

A contract field is judged for each table that uses the contract, against
the pack that keeps the table: the pack of its store step, else of its
ingest step when that step produces the table or the table ends at the
landed files. Only the contract's own fields and those of the schema entry
the table uses are judged for it. When that pack declares the field's path
`not-yet` (its own entry, not one above it), the field is `NOT_APPLIED`, a
warning at the field:
`<field> of "<name>" in contract "<id>" isn't applied on <pack>: <reason>`,
where `<field>` is the field's key and `<name>` the `name` of the mapping that
holds it (` of "<name>"` is left out when it has none), with the subject
(section 1.2) `{ table, feature: <field path> }`. A field that is `used`,
`elsewhere` or `documentation` on that pack, or that it does not declare,
reports nothing, whatever the standard's other packs say. The fields under a
field reported this way, or under one reported `CAPABILITY_OFF` (section
7.1), are not judged. `CONTRACT_FIELD_UNUSED` is no longer reported.

### 6.1 Cleansing

A standard gives defaults for every table; a flow table or a transform gives
its own, for named columns. Nothing is declared in the contract.

```yaml
# standard.yaml
cleanse:
  text: { trim: true, empty: null } # every text column

# a transform, or a flow table: cleanse.columns names the contract's columns
cleanse:
  columns:
    email: { case: lower }
    country: { map: { GBR: GB, "United Kingdom": GB }, case: upper }
    status: { default: unknown }
    notes: { trim: false } # overrides the standard
  deduplicate: { order_by: [updated_at] } # section 6.2
```

The operations on one column are, in this order and after the cast to the
contract's types: `timezone` (section 6.3), `trim` (`true`: removes leading and trailing whitespace),
`empty` (`null`: turns an empty string into null), `map` (replaces the listed
values exactly), `case` (`upper` or `lower`) and `default` (replaces null with
a value). `trim: false` and `empty: false` take the operation away. Row checks
see the cleansed values.

**What a table gets.** The standard's `cleanse.text` gives `trim` and `empty`
to each text column of the table's contract, not overriding what the table
writes for that column, when the table does not end at the landed files and:

- the table's `does` (section 5) lists `cleanse`; or
- the table has no `does` and is a flow table. A transform in a layer without
  `does` gets none, and so does a table whose `does` leaves out `cleanse`.

A column is text when its contract `logicalType` is `string`. Then
`ResolvedTable.cleanse.columns` has, for each column with at least one
operation, in the contract's column order, an object with the keys of
`ColumnCleanse` in the order above: `timezone`, `trim: true`, `empty: true`,
`map`, `case` and `default`. A table with no operation and no `deduplicate` has no
`cleanse`.

**Judged against the contract.** Each column's type is the type of the contract
the table uses, so a column cast from text in one table to an integer in the
next is an integer in the second. For each operation the table writes:

- `CLEANSE_COLUMN`, an error at the column's key: a column that the contract
  does not list. The message is `"<column>" is not a column of contract "<id>".`
  and the hint `Use a column the contract lists: <names>.`, the first ten
  names in the contract's order and, for a longer list, `, and <n> more`.
- `CLEANSE_TYPE`, an error at the operation: `trim`, `empty` or `case` on a
  column whose `logicalType` is given and is not `string`:
  `"<operation>" works on text, and "<column>" is <type> in contract "<id>".`
  with the hint `Remove "<operation>" from "<column>", or cleanse it where it is still text.`;
  a `default` value, or a `map` key or value, that does not fit the column's
  type: `The "default" value <value> doesn't fit "<column>", which is <type> in
contract "<id>".`, with `The "map" key <key>` and `The "map" value <value>`
  in place of `The "default" value <value>`, and the hint `Give a value of the
column's type.` A value fits `string` when it is text; `integer` when it is a
  whole number; `number` when it is a number; `boolean` when it is true or
  false; `date` when it is text in the form `YYYY-MM-DD`; `timestamp` when it is
  text in the form `YYYY-MM-DD` followed by `T` or a space and a time. A `map`
  key is text, and fits when it reads as such a value. A `map` value of null
  fits a column that is not required. A column of any other type, or with
  no `logicalType`, takes any `map` and `default` value. The standard's
  defaults are never judged: they skip a column that is not text.
- `LAYER_RESPONSIBILITY` (section 5) at `cleanse.columns`, with `cleansing`
  as the thing written, when the table has `does` and it does not list
  `cleanse`. A table that writes only `trim: false` or `empty: false` is not
  affected.

When any of these is reported, the table has no `cleanse` and its
operations are not judged below.

**Not applied.** The step that keeps the table (section 11.7) judges each
operation for the intent path `cleanse.trim`, `cleanse.empty`, `cleanse.map`,
`cleanse.case`, `cleanse.default` and, for a time zone conversion (section 6.3),
`cleanse.timezone`, with the value `true`, as it judges a quality rule, and for `deduplicate` (section 6.2). The table is judged for
the operations it writes, each at the key that wrote it in the flow table
or transform; and for those that came from the standard's `cleanse.text`,
once for each operation that reached at least one column, at the default's
key in the standard. A warning with `NOT_APPLIED`:

```text
Cleansing "<operation>" of "<column>" isn't applied on <pack>: <reason>
Cleansing "<operation>" of text columns isn't applied on <pack>: <reason>
```

where `<pack>` is the keeping step's pack's id, with the subject (section
1.2) `{ table, feature: cleanse.<operation> }`. An entry that is `used` with
`onlyWhere: cleanse` is `NOT_APPLIED` the same way in a table whose `does`
does not list `cleanse` (section 11.7). On a table that ends at the landed
files, each operation it writes, and its `deduplicate`, is `NOT_APPLIED` on the
ingest step's pack, whatever any pack says, with the reason `the table ends at
the landed files, and nothing cleanses them.` and the hint `Add a store step to
have it cleansed.`

### 6.2 Deduplicate

`cleanse.deduplicate` on a flow table or a transform keeps one row for each
primary key of the table's contract: the last by `order_by`, a list of one or
more contract columns (otherwise `CLEANSE_COLUMN` at the item of the list).
`ResolvedTable.cleanse.deduplicate` is `{ orderBy }`, the list as written.
It happens after cleansing and before the row checks. It needs the layer's
`does` to list `deduplicate`, or no `does` (`LAYER_RESPONSIBILITY`, with
`deduplicating` as the thing written), and:

- `DEDUPLICATE_KEY`, an error at `cleanse.deduplicate`, when the contract has
  no primary key: `"<table>" has no primary key, so deduplicate cannot tell
which rows belong together.`, with the hint `Mark the key columns
`primaryKey: true` in contract "<id>".`
- `DEDUPLICATE_MODE`, when the table is stored by a step (a table that ends at
  the landed files, or that an ingest step writes, has none). It is judged first
  by how the store step keeps rows, then by the table's resolved `history`
  (section 11.1). A store step **appends** when its method has an alias for the
  setting `mode` (section 11.4) and the step's `mode` setting is `append`; the
  pack declares that alias, and the model knows no other way to tell an append
  from a replace. This is judged before history: an appending store is an error
  whatever the table's `history` says, such as a written `mode: append` that
  the layer's `history: latest` does not change.
  - In a store that appends, an error at `cleanse.deduplicate`:
    `Deduplicate cannot work for "<table>": its store appends rows, and rows
already kept cannot be deduplicated.`, with the hint `Set history: latest to
keep one row per key, or deduplicate in a transform that reads this table.`
  - Otherwise, with `history: latest` or `full` and only when the keeping
    step's method, else its pack, declares `history=<value>` as `used`
    (section 11.5, found as `intentUseOf` finds it), a warning at
    `cleanse.deduplicate`: `Deduplicate is redundant for "<table>": its history
is <history>, which already decides what is kept for each key.`, with the
    hint `Remove deduplicate.` and the fix `Remove deduplicate`, which removes
    the key. The subject's feature is `deduplicate`. When the step declares the
    history `not-applicable`, `not-yet` or `elsewhere`, or says nothing, the
    store does not keep that history, so `deduplicate` is what keeps one row
    per key: it stands, with no `DEDUPLICATE_MODE`.

  A `DEDUPLICATE_MODE` or `DEDUPLICATE_KEY` leaves the operation unjudged for
  `NOT_APPLIED`; a `DEDUPLICATE_MODE` warning leaves `deduplicate` in the
  model.

`deduplicate` is `NOT_APPLIED` as an operation of section 6.1 is, with the
path `deduplicate`, the value `true`, the feature `deduplicate` and the
message `Deduplicate isn't applied on <pack>: <reason>`.

### 6.3 Time zones

A timestamp column can be converted from the zone its source wrote it in to the
zone the warehouse keeps. The zone is carried from table to table, so a later
table never converts what an earlier one has converted.

**Declaring it.**

```yaml
# connections/crm.yaml: the zone the source writes its timestamps in
timezone: Europe/London

# standard.yaml: every timestamp column of the tables that cleanse
cleanse:
  timestamps: { to: UTC }

# a transform, or a flow table
cleanse:
  columns:
    signed_up: { timezone: { to: Europe/London } } # from the table's zone
    created_at: { timezone: { from: UTC, to: Europe/London } } # from a zone named here
    exported_at: { timezone: false } # the standard's rule does not apply
```

- A Connection's `timezone` is the zone its timestamps are written in: a wall
  clock with no offset. A Connection with none is taken to be in `UTC`.
- The standard's `cleanse.timestamps.to` gives a `timezone` to each column
  whose contract `logicalType` is `timestamp`, in the tables that the standard's
  `cleanse.text` reaches (section 6.1), not overriding what the table writes
  for that column.
- A column's `timezone` is `{ to }`, `{ from, to }` or `false`. `false` takes
  the standard's rule away from that column. `from` is the zone the column's
  timestamps are in; without it, the table's input zone below.
- A zone is `UTC` or a name from the IANA time zone database, aliases included
  (a zone's older and newer names are both accepted), written exactly
  (case matters). A name that is not on the list the implementation ships is
  `TIMEZONE_NAME`, an error at the name: a Connection's `timezone`, the
  standard's `cleanse.timestamps.to`, and a column's `from` and `to`. A value
  that holds an unset reference is not checked. The message is `"<name>" is not
a time zone name.` and the hint is `Did you mean "<listed name>"?` when a
  listed name differs from it only in case, else `Use a name from the IANA time
zone database, such as Europe/London, or UTC.` The list is generated, into
  `packages/definitions/src/data/zones.json`, from the union of the tz database
  that the Node.js 22 runtime ships (`Intl.supportedValuesOf`), the zone files
  of the operating system's tz tree (`/usr/share/zoneinfo`) that the runtime
  accepts as a zone, which adds the aliases the runtime's own list leaves out,
  and `UTC` and `Etc/UTC`. The file records the versions of both databases;
  every zone this specification, its cases and the published standards use is
  on it.
- `timezone` on a column whose `logicalType` is given and is not `timestamp` is
  `CLEANSE_TYPE` (section 6.1): `"timezone" works on timestamps, and
"<column>" is <type> in contract "<id>".`, with the hint `Remove "timezone"
from "<column>", or convert it where it is still a timestamp.`

**The zone of a table.** `ResolvedTable.timezone` is the zone the table's
timestamp columns are in once the table is built:

- the **input zone** of a flow table is its Connection's `timezone`, else `UTC`;
  of a transform, the zone of its inputs when they all have the same one. When
  they differ, the transform has no input zone;
- a column converted from a zone to another is then in the `to` zone; a
  timestamp column that is not converted stays in the input zone;
- the table's zone is the zone all its timestamp columns are in. When they are
  not all in one zone (columns converted to different zones, or only some
  converted), the table has no `timezone`. A column is in its `to` zone only
  when the step that keeps the table applies conversion: its method, else its
  pack, declares the intent path `cleanse.timezone` as `used` (section 11.5),
  the entry's `onlyWhere`, if any, is met (section 11.7), and neither the
  column's `from` nor its `to` is in the entry's `zonesNotApplied` (section 11.5).
  Otherwise the column stays in the zone it was in (its `from`), and a later
  table that reads it converts it. A pack that says nothing of `cleanse.timezone` does not apply it.
  A table whose steps cannot be judged yet, because it holds an unset reference,
  is taken to apply it. A table with no timestamp column has
  its input zone; a table that ends at the landed files has the Connection's, as nothing converts it.

**What is converted.** A column's conversion is `{ from, to }`: `from` is the
column's own, else the input zone; `to` is the column's own, else the
standard's. `ResolvedTable.cleanse.columns[<column>].timezone` holds it, and
it is the first of the column's operations. A conversion whose `from` and `to`
are the same zone is not made and is not recorded: that is how a later table
reading a converted one does not convert it again. So:

- a table whose inputs are all in `UTC` converts a column `{ to: UTC }` or by
  the standard's `cleanse.timestamps: { to: UTC }` to nothing;
- a silver table that converts `Europe/London` to `UTC`, on a pack that applies
  conversion, has the zone `UTC`, and a gold table that reads it with the same
  rule converts nothing. Where silver's pack does not apply it, silver keeps
  `Europe/London` and gold converts from it.

`TIMEZONE_SOURCE`, an error: the table has no input zone (its inputs are in
different zones) and a column is converted without `from`. It is reported once
for each such column: at the column's `timezone` when the table writes one, else
(for the standard's rule) at the transform's `inputs`. The message is `The
inputs of "<table>" are in different time zones (<zones>), so "<column>" needs a
"from" zone.`, with the zones listed in the order of the inputs, each once (an input that has no `timezone` is listed as `more than one`), and
the hint `Write timezone: { from: <zone>, to: <zone> } for "<column>".`. When
anything in this section is reported, the table has no `cleanse` (section 6.1);
its `timezone` is its input zone.

**Not applied.** A conversion is judged for the intent path `cleanse.timezone`
with the value `true` (section 6.1): each the table writes at its `timezone`
key, and, once, the standard's at `cleanse.timestamps` when it reached at least
one column, as `Cleansing "timezone" of timestamp columns isn't applied on
<pack>: <reason>`. A conversion that is not made (`from` and `to` the same) is
not judged. A table that ends at the landed files is not converted by the
standard's rule, and the conversions it writes are `NOT_APPLIED` as section 6.1
says. A table's `timezone` is the zone its applied conversions give, as above; a
conversion that is `NOT_APPLIED` leaves the column in the zone it was in.

**A zone the pack cannot convert.** Where the step that keeps the table applies
conversion and its `cleanse.timezone` entry lists zones in `zonesNotApplied`,
each conversion whose `from` or `to` is listed is `NOT_APPLIED`, a warning, with
the message `Time zone conversion isn't applied on <pack>: <reason>`, `<reason>`
being the listed zone's (its `from`'s when both are listed), and the subject
feature `cleanse.timezone`. It is reported at the column's `timezone` key when
the table writes one; a conversion the standard's rule gives is reported at
`cleanse.timestamps`, once for each listed zone in the table. The conversion
stays in `ResolvedTable.cleanse` as the table resolves it, so a pack sees what
it does not convert, and the column stays in its `from` zone, as above.

## 7. Platform defaults

| Setting              | Default                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`               | `production` when the environment is `prod` or `production`, else `development`; with `environmentsTogether`, `development` when the environment is `dev`, else `production` |
| `compute.serverless` | `true`                                                                                                                                                                       |
| `schedule.timezone`  | `UTC`                                                                                                                                                                        |
| `schedule.paused`    | `false` when `mode` is set to `production`, or is not set and the environment is `prod` or `production`; else `true`                                                         |
| `manage.schemas`     | `false`                                                                                                                                                                      |
| `manage.tags`        | `false`                                                                                                                                                                      |
| `manage.comments`    | `false`                                                                                                                                                                      |
| `manage.checks`      | `false`                                                                                                                                                                      |
| `accept`             | empty (no warning is accepted)                                                                                                                                               |
| `principals`         | empty (each role is its own principal, section 8.2)                                                                                                                          |
| everything else      | empty                                                                                                                                                                        |

Loading without an environment uses the environment name `default`.

A project is resolved with `environmentsTogether: true` when every
environment is generated together, as the CLI from version 2.0 does
([output folders](../cli/outputs.md), section 1). Without it, `mode` defaults
as it did before definitions 1.8, so a tool that resolves one environment at a
time sees no change. `development` mode is for a personal copy: on Databricks
it prefixes names with the deploying user and turns off the deployment lock.
With `environmentsTogether`, a shared environment that a pipeline deploys,
such as `test`, is therefore `production` unless the platform sets `mode`, and
so is `default`, the environment of a project that declares none.
`schedule.paused` is the same with or without the option: only `prod` and
`production`, or a platform that sets `mode: production`, run their schedules
unless `schedule.paused` says otherwise.

A pack MAY list, as data (`platformFields`), the Platform fields it reads, so
that tools can show them, such as each one with its default in the pack's
reference. Each is a path, its keys joined with `.`, such as
`schedule.paused` or `permissions.*.level`, and MUST be the `path` of an
entry of the Platform's field reference (section 10). Every pack given to
resolution is checked, not only those the standard names. A pack that lists
any other path is refused when it is given, before any file is read, with
the error
`The pack "<id>" lists the platform field "<path>", which the Platform document does not have.`,
for the first such path in the order the packs are given. It is the pack's
mistake, not the project's, so resolution does not report it among the
project's diagnostics: resolution stops with it. A tool checks the packs
first, without resolving, and reports a refused pack as `PACK_LOAD`, an error
with no location, with that message and the hint
`This is a mistake in the pack, not in the project, so nothing is checked or generated. Install a version of Ingestron, or of the editor extension, that fixes it.`
It then reads, checks and generates nothing.
The list changes nothing else; what a pack reads is still the model's
`platform`.

**Common fields, alerts and moved fields.** The Platform keeps the fields
every pack reads (`tags`, `naming`, `schedule`, `settings`) and gains `alerts`,
`principals` and one section per pack (section 7.2). `principals` maps a
contract role to the principal it is on this platform, a user, group or
service principal, usually per environment through `${values.…}`; the model's
`platform.principals` is the mapping as written, `{}` when it is not given
(section 8.2). Each item of `alerts` is either
`{ kind: email, to: [<address>…], on: […] }` or
`{ kind: destination, id: <text>, on: […] }`, a destination that the platform
holds; `on` lists `failure` and `slow` and is `[failure]` when left out. The
model's `platform.alerts` has every alert, `on` filled in.

`mode`, `workspace`, `run_as`, `compute`, `permissions`, `manage` and `grants`
belong to Databricks and are written in the Platform's `databricks` section.
The model's `platform` keeps them where it always had them, with the same
meaning and defaults, so a pack reads them as before: each is the value in the
`databricks` section, else the value at the top of the Platform, else its
default. Written at the top, a field is still accepted, and is
`PLATFORM_FIELD_MOVED`, a warning at the field:
`"<field>" now belongs in the databricks section of the Platform.`, with the
fix `Move to databricks.<field>`, which sets the value at
`/databricks/<field>`, exactly as written (a `${…}` reference stays a reference,
so no environment's value is copied into the file), and removes the old key.
When the value cannot be read as written, such as one included from another
file, the warning has no fix. The warning is given only when
the standard names a pack `databricks` that has a Platform section, because
there is nowhere else to move the field to. Written in both places with the
same value (compared as data), it is only that warning. Written with different
values, it is `BAD_SETTING`, an error at the old place and not that warning; a
value that holds an unset reference is not compared. Values are compared as
they are for the selected environment, so a field can agree in one
environment and differ in another.

`notifications.on_failure` is also still accepted: its addresses fill
`platform.notifications.on_failure` as before, and become the alert
`{ kind: email, to: <the addresses>, on: [failure] }` in `platform.alerts`.
With the `databricks` section's pack named (above), `PLATFORM_FIELD_MOVED`
is also given at `notifications`:
`"notifications.on_failure" now belongs in "alerts" of the Platform.`, with
the fix `Move to alerts`, which writes the addresses as written, references
included; both kinds of warning are given on the same
condition. A list with no address makes no alert. When the Platform writes
both `notifications` and `alerts`, `alerts` is used as written, and the alert
from `notifications` is added after them only when no email alert that has
`failure` in `on` already lists all of those addresses.

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
platform: `<field> in contract "<id>" is not applied: the platform has
<title> off.`, with the hint `Turn it on with manage.<capability> in
platform.yaml. It needs: <needs>.` (the last sentence left out when the
capability names no needs). A column's `unique` is the exception: it is a
table check (section 6), so it is judged for each table that uses the
contract, as table checks are below, whatever the standard's packs declare
for the field. When table checks do not run for a table, `unique: true` is
this warning at `unique`, about that table, with `checks` as the capability;
the field's declarations never report it a second time (case 137d). Grants in the platform with `manage.schemas` off are
`CAPABILITY_OFF` at `grants`, with the same fix. A contract rule that counts
over all rows with `manage.checks` off is `CAPABILITY_OFF` at the rule
(section 6), for a table kept by a pack that declares a `checks` capability.
Checks are on per pack: a pack that declares no `checks` capability, such as
one whose engine runs the counts in its own run with nothing shared to turn
on, runs its tables' table checks (and `unique`) whatever `manage.checks`
says, and nothing is reported. The pack that keeps a table is its store
step's, else that of an ingest step that writes the table itself; a contract
that two tables use is resolved for each, so one kept by each kind of pack
gets table checks for one and `CAPABILITY_OFF` for the other.

`manage` and `grants` are read as the model's `platform` has them (section 7):
written in the `databricks` section, they count exactly as at the top, and
grants written there are reported at `/databricks/grants`. When the standard
names a pack `databricks` that has a Platform section, the fix
`Turn on manage.<capability>` sets `/databricks/manage/<capability>` and the
hint names `databricks.manage.<capability>`; when the Platform writes `manage`
only at the top, the fix instead sets `/databricks/manage` to that mapping,
as written, with the capability turned on, and removes the old key, so the
section and the top never disagree (when that mapping cannot be read as
written, the fix sets `/manage/<capability>`). When the Platform writes
`manage` both in the section and at the top, the fix sets
`/databricks/manage/<capability>` and removes `/manage`. Without that pack, the
fix sets `/manage/<capability>`. The fix and hint of a table check that is not
checked (section 6) are these for `checks`.

**Capabilities per pack.** The access capabilities `grants`, `masks` and
`filters` (section 8.2) are judged for the pack that keeps a table, and so are
`tags` and `schemas` where access needs them (below, and `POLICY_LIMIT` in
section 8.2). Each is read in that pack's own section,
`<pack>.manage.<capability>: true`, and is off unless it is turned on there.
For the pack `databricks`, `manage` is read as the model's `platform` has it, so
`manage` written at the top counts exactly as in its section, as above. For
any other pack only its section counts: `manage` at the top does not turn
anything on for it. Everything else above (contract fields, table checks and
the Platform's `grants`) reads `manage` as before. When a capability is off for
a pack other than `databricks`, the fix `Turn on manage.<capability>` sets
`/<pack>/manage/<capability>` and the hint names
`<pack>.manage.<capability>`; for `databricks` the fix and hint are those
above. The Platform schema's `manage` accepts `grants`, `masks` and `filters`
(each a boolean), since `manage` written at the top is the `databricks`
section's moved field.

Masks and row filters match columns by their tags, so for each of `masks` and
`filters` that a pack declares as a capability and has on with `tags` off, it is
`CAPABILITY_OFF` at that pack's `manage.masks` or `manage.filters`, about the
capability `tags`: `Masks are not applied: the platform has <title> off.` or
`Row filters are not applied: the platform has <title> off.`, with the hint and
fix that turn `tags` on for that pack, as above.

### 7.2 Pack sections

A pack MAY declare, as data, `platformSection`: a JSON Schema for its section
of the Platform, the mapping under the key that is the pack's id. The
Platform's other keys are reserved: `apiVersion`, `kind`, `id`,
`description`, `workspace`, `mode`, `run_as`, `compute`, `settings`, `naming`,
`tags`, `permissions`, `schedule`, `notifications`, `manage`, `grants`,
`alerts`, `accept` and `principals`. Any other key that is a lower-case name
(letters, digits and hyphens, starting with a letter) is a section, and its
value MUST be a mapping.

Resolution checks each section the Platform writes:

1. A section whose key is not the id of a pack the standard names is
   `UNKNOWN_PACK`, an error at the key. When a pack of that id is available,
   the fix is `Add the "<pack>" pack`, which adds `<pack>@<version>` to the
   standard's `packs`.
2. A section of a pack that declares no `platformSection` has no fields: it
   may be written, and may only be empty.
3. Otherwise the section is checked against the pack's `platformSection`, as
   a method's settings are checked against its schema (section 3): each
   failure is `BAD_SETTING`, an error at the failing key, or at the section
   for a missing field, except a failure that a value holding an unset
   reference or `REPLACE_ME` causes. The message names the section:
   `Platform section "<pack>": <what failed>.`

The model's `platform.sections` maps each such pack id to its section as
written, after the check; a pack names no section the Platform does not write.
A pack reads its own, such as `platform.sections.<id>`.

A pack MAY also list the fields of its section in `platformFields`, written
`<id>.<path>` with its own id first and the path as the field reference
describes it (section 10); each is checked against `platformSectionReference`,
the field reference of its `platformSection`: every entry's path prefixed with
the pack's id, with docs anchors `/docs/reference/packs/<id>#<anchor>` of
`platform` followed by the path (the anchor as in section 10). A path that has
no entry is refused as in section 7. Other paths are checked against the
Platform's field reference, as before.

## 8. Data products

A `DataProduct` document is an Open Data Product Standard (ODPS) file used as
written: `apiVersion: v1.0.0` or `v1.1.0`, `kind: DataProduct`, checked
against the bundled ODPS v1.1.0 schema. Its fields are documentation, shown on
the product's passport, except these:

- `outputPorts[].contractId` names the contract whose tables the product
  publishes. It MUST be the id of a contract in the project (`BROKEN_LINK`).
- `team.members[]` whose `role` is `owner`, in any case, are its owners.

Each product is checked:

- An output port's contract that no flow table and no transform names is
  `PRODUCT_CONTRACT_UNUSED`, an error at the port's `contractId`. This looks at
  the definitions, so it is the same in every environment.
- When the contract is named, but no table of the environment uses it (for
  example one a `runs-on` environment skips), it is `PRODUCT_NOT_BUILT`, a
  warning at the port's `contractId`, unless another problem stopped a table
  resolving; the product is kept with no tables for that output.
- A contract MUST be an output of at most one product: one owner per
  published table. A second port publishing it is `PRODUCT_CONTRACT_SHARED`,
  an error at that port's `contractId`.
- Each product's passport is named from its id: the id with anything but
  letters, digits, `.`, `_` and `-` replaced by `-`, then `.md`. Two products
  whose passport names are the same, ignoring case, are `DUPLICATE_PRODUCT`,
  an error at the second one's `id`; an id whose passport would be
  `README.md` in any case is `PRODUCT_ID`, an error at its `id`, since that
  file lists every product.

`inputPorts`, and output ports without a `contractId`, are documentation:
nothing checks them.

The resolved model lists the products in `products`, by id, each with its
outputs and the names of the tables that build each one in the environment.
From a contract, the model also keeps its `roles` (`role`, `access`,
`description`, `firstLevelApprovers`) and its `slaProperties` as `sla`
(`property`, `value` as text, `unit`), and its quality rules nothing checks
(`name`, `description`, and why: text rules among them), for the passport.
Such a rule that an engine or the platform could check, but does not here,
also has `notEnforced`, the code of the warning reported for it:
`NOT_APPLIED` on a table that ends at the landed files, `CAPABILITY_OFF` for a
count over all rows with checks off (section 6). A rule nobody could check as
written, a `text` rule among them, has none.

### 8.1 Governance

A standard can require governance of its data products in an optional
`governance` section. Without it nothing below is checked. It governs the
**output contracts**: the contracts named by any product's output ports;
other contracts are not governed.

```yaml
governance:
  products: { require: [owner, purpose] } # owner, purpose, support, domain
  classification:
    values: [public, internal, confidential, restricted]
    columns: required # or optional, the default
    sensitive: [confidential, restricted]
    tag: classification # the platform's tag key; the default
  access:
    sensitive: { require: [description, firstLevelApprovers] } # also access
    grants: additive # or exact (section 8.2)
  masks: { confidential: hash, restricted: "null" } # section 8.2
  filters: # section 8.2
    region_rows: { function: region_filter, match: { tag: region } }
```

`classification.tag`, `access.grants`, `masks` and `filters` say how access is
generated (section 8.2); they check nothing here. The model's
`standard.governance` is the section as written, with `classification.tag`
filled in: `classification` when the standard does not give it. A standard
without `governance` has none in the model, and its tag key is
`classification`. The package gives the key a model sets classifications as,
`classificationTag(model)`, and the default, `defaultClassificationTag`, so a
pack never repeats the default.

Every problem here is an error at the value that causes it, and all are
reported in one run:

- `PRODUCT_INCOMPLETE`, at the product's `id`: a fact `products.require`
  names is missing. `owner` is a team member whose role is `owner`; `purpose`
  is `description.purpose`; `support` is at least one `support` entry;
  `domain` is `domain`.
- `COLUMN_UNCLASSIFIED`, at the column's `name`: with `columns: required`, a
  column of an output contract has no `classification`.
- `CLASSIFICATION_UNKNOWN`, at the `classification`: it is not one of
  `values` (when `values` is given). Each allowed value is offered as a fix,
  `Change to "<value>"`.
- `SENSITIVE_ACCESS`: an output contract with a column whose classification
  is in `sensitive` declares no `roles` (at the first such column's
  `classification`), or a role lacks a field `access.sensitive.require` names
  (at that role).

### 8.2 Access

Who may use each table, and which of its columns and rows are hidden, is
resolved once from the contracts, the standard and the Platform, so every pack
applies the same answer. Whether the step that keeps a table applies it, and
whether the platform turns it on, is judged separately.

```yaml
# standard.yaml
layers:
  - name: bronze
    access: { contract: false, roles: [{ role: data-engineers, access: write }] }
  - silver
governance:
  classification: { tag: classification } # the tag key; the default
  access: { grants: exact } # or additive, the default
  masks: # classification: mask
    confidential: hash # null, hash, redact, or a function's name
    restricted: "null"
  filters:
    region_rows:
      function: region_filter # a BOOLEAN function the team owns
      match: { tag: region } # or { tag, value }, or { classification }

# platform.yaml
principals:
  marketing-analysts: ${values.marketing_group}
```

**Which tables.** Access is resolved for every table that does not end at the
landed files. A table that ends there keeps no table, so it has none.

**Grants.** A table's grants are, in order:

1. each role of its contract (ODCS `roles`), with `from: contract`, unless the
   table's layer gives `access.contract: false`;
2. each role of its layer's `access.roles`, with `from: layer`.

Each is `{ role, principal, privileges, from }`. `principal` is the Platform's
`principals` entry for the role, else the role itself. `privileges` is
`[read]` for `access: read` or no `access`, and `[read, write]` for `write`;
each pack says what they are in its own words. A role is listed each time it
is written, so one principal may appear more than once.

`ROLE_ACCESS`: a contract role whose `access` is neither `read` nor `write` is
an error at the `access`, once for each contract, where the role would be
granted: on a table whose layer grants the contract's roles and whose keeping
pack applies grants (below). Anywhere else the value is not used, and it is not
reported, so a project that does not grant gains no error:
`The role "<role>" of contract "<id>" has access "<access>"; it must be read or write.`
with the hint `Write read, or write for read and write. Leave it out to read.`
A layer role's `access` is checked by the Standard schema.

**Exact.** `exact` is `true` when the standard's `governance.access.grants` is
`exact`, and `false` when it is `additive` or not given: then nothing granted
otherwise is taken away. Exact grants reach every table whose grants are
applied (below), so a table that grants no role has every direct grant on it
taken away.

**Masks.** `governance.masks` maps a classification to its mask: `null`,
`hash` or `redact`, or the name of a function the team owns, in one part or
three. A YAML null written unquoted (`restricted: null`) is the mask `null`.
For each column of the table's contract whose `classification` is a key of
`masks`, in the contract's column order, the table has
`{ column, classification, mask }`: `mask` is `null`, `hash` or `redact` as
written, and `{ function: <name> }` for any other name, exactly as written (a
pack says where a one-part name lives).

`MASK_TYPE`: `hash` or `redact` for a column whose `logicalType` is given and
is not `string` is an error at the column's `classification`, once for each
contract column:
`The mask "<mask>" for "<classification>" works on text, and "<column>" is <type> in contract "<id>".`
with the hint
`Mask "<classification>" with "null" or a function of your own, or classify "<column>" differently.`
`null` and a function take a column of any type.

**Filters.** `governance.filters` maps a filter's name to its `function`, the
name of a BOOLEAN function the team owns (in one part or three, kept as
written), and its `match`, which names the column the function is given:

- `{ classification: <value> }`: the columns classified `<value>`;
- `{ tag: <key> }`: the columns with a tag whose key is `<key>`;
- `{ tag: <key>, value: <value> }`: the columns with that tag key and value.

A column's tags are its contract `tags`, each `<key>` or `<key>:<value>`, and,
for a classified column, `<tag>:<classification>`, where `<tag>` is
`governance.classification.tag`: the tags a platform sets on it. For each
filter, in the order written, a table whose contract has one such column has
`{ name, column, function }`; a table with none does not have the filter.

`FILTER_MATCH`: a filter that matches two or more columns of a table is an
error at the filter, once for each contract:
`The filter "<name>" matches <n> columns of contract "<id>": <columns>. A filter matches one column of each table.`
with the columns in the contract's order, joined with `, `, and the hint
`Narrow its match, such as with a tag value, or tag only one of the columns.`

**In the model.** `ResolvedTable.access` is `{ grants, exact, masks, filters }`
when any of `grants`, `masks` and `filters` is not empty. With exact grants, a
table that has none of them but whose grants are applied by the pack that
keeps it (judged below, as for a role: the keeping step's entry for
`access.grants=read` is `used` and the platform turns `grants` on for that
pack) has `{ grants: [], exact: true, masks: [], filters: [] }`, and its exact
grants are judged as any table's. Otherwise the table has no `access`, as
before access was resolved; additive grants, the default, give no table an
`access` it did not have.

**Judging access.** A table's access is judged by the step that keeps the
table, as checks are (section 11.7): its store step, else its ingest step when
that step produces the table. A table whose steps are not known is not judged.
Each declared item is judged on the intent paths of section 11.1, the entry
found as section 11.5 finds it (the keeping step's method, then its pack), and
against the pack's capability (section 7.1):

| Item                                              | Path and value                                  | Capability | Feature   | Declaring line                                            |
| ------------------------------------------------- | ----------------------------------------------- | ---------- | --------- | --------------------------------------------------------- |
| a contract role, unless the layer turns them off  | `access.grants=read`                            | `grants`   | `grants`  | the role in the contract (`/roles/<n>`)                   |
| a layer role                                      | `access.grants=read`                            | `grants`   | `grants`  | the role in the standard (`/layers/<n>/access/roles/<m>`) |
| a role's `write`, once its grant is applied       | `access.grants=write`                           | `grants`   | `write`   | the role's `access`                                       |
| exact grants, once the table's grants are applied | `access.exact=true`                             | `grants`   | `exact`   | the standard's `/governance/access/grants`                |
| a column's mask                                   | `access.masks=<null, hash, redact or function>` | `masks`    | `masks`   | the column's `classification` in the contract             |
| a row filter                                      | `access.filters=true`                           | `filters`  | `filters` | the filter in the standard (`/governance/filters/<name>`) |

Every role is judged, whatever its `access`: a role whose `access` is neither
`read` nor `write` is judged as `read`, and where its grant is applied it is
`ROLE_ACCESS` (above). For each item:

- an entry that is `not-yet` or `not-applicable` is `NOT_APPLIED`, a warning at
  the declaring line: `<what> in <tables> isn't applied on <pack>: <reason>`;
- an entry that is `used`, with the capability off for the keeping pack
  (section 7.1), is `CAPABILITY_OFF` at the declaring line:
  `<what> in <tables> is not applied: the platform has <title> off.`, with the
  hint and fix of section 7.1;
- an entry that is `used`, with the capability on, applies the item;
- an `elsewhere` entry, and no entry at all, report nothing, as in section
  11.5, and the item is not applied.

`<what>` is `Access for the role "<role>"`, `Write access for the role
"<role>"`, `The exact grant mode`, `The "<mask>" mask on "<column>"` (the function's
name for a function) or `The filter "<name>"`. `<tables>` is `table "<name>"`,
or `tables "<name>", "<name>"…` in the order of the tables. A declaring line
gives one warning for each code, feature, pack and reason in an environment,
naming every table it is about, at no place when the declaring line is not
known; its subject (section 1.2) has the feature, and
the `table` only when it names one table. Each table it names has the feature in
its `notApplied` (section 11.7), with the `column` for a mask.

The errors below are judged only for a pack that keeps a table in the
environment to which it applies a mask or a filter (its coverage uses it and
its switch is on, above): a switch that applies nothing needs nothing. Each is
reported once, at the pack's `manage.masks` (at `manage.filters` when masks are off), where the
Platform writes it:

- `MASK_NEEDS_RUN_AS`: the pack's section gives no `run_as` (for `databricks`,
  read as the model's `platform` has it). Every mask and filter lets `run_as`
  see real values, so the pipeline never reads masked data and writes it on:
  `Masks and filters on <pack> need run_as, the principal the pipeline runs as, so it reads real values.`,
  with the hint `Give <pack>.run_as.`
- `MASK_FUNCTIONS`: an applied mask that is built in, or whose function's name
  has one part, or an applied filter whose function's name has one part, on a
  table the pack keeps, and the pack's section gives no
  `governance.functions`, the schema that holds them:
  `Masks and filters on <pack> need governance.functions, the schema that holds <items>.`,
  where `<items>` names each once, in the order of the tables, then of their
  masks and filters: `the "<mask>" mask` or `the function "<name>"`, joined
  with `, `, with the hint
  `Give <pack>.governance.functions, such as ${values.governance_schema}.`
- `POLICY_LIMIT`: the policies Ingestron would create exceed what the
  platform allows: one for each masked classification and one for each filter
  that is applied, on each schema of the pack's tables when `manage.schemas` is
  on for the pack (over 100 is the error), else on each table (over 50):
  `<n> policies would be on the schema "<catalog>.<schema>", over the 100 a schema may have.`
  or `<n> policies would be on the table "<catalog>.<schema>.<table>", over the 50 a table may have.`,
  with the hint `Mask fewer classifications, or use fewer filters.` It is an
  error at the standard's `/governance`.
- `POLICY_PRINCIPALS`: where any mask or filter is applied, `run_as` and the
  pack's `governance.unmasked`, each principal counted once, are more than the
  20 principals one policy can exempt:
  `<n> principals would see real values: run_as and governance.unmasked may name 20.`,
  with the hint `Put the principals in fewer groups.` It is an error at the
  pack's `governance.unmasked`.

## 9. Conformance

Each case in [conformance/](conformance/) gives `files` (the project), an
optional `environment`, optional `envvars` and `missingEnvvars` (as in the
config conformance cases), an optional `deployTime: true` (section 1.1), an
optional `environmentsTogether: true` (section 7), an optional
`replaceMe: error` (section 1), and
`expect`: `tables` (partial objects, in order,
with `fullName` written as `catalog.schema.table`, and `null` at any key for
a value the table does not have, such as `serve: null` for a step or
`settings: { mode: null }` for a setting), `products` (partial objects,
in order), `standard` (a partial object), `platform`, `names`, `deployValues`, `previewFeatures` and
`operations` (the model's, exactly) and `qualityResults`, or
`diagnostics` (matched in order on the fields given; `fixes` lists the fix
titles, and `fixes: []` means the diagnostic has none; `subject` is matched
on the keys given, and `subject: null` means the diagnostic has none),
`accepted` (the accepted warnings, in order and matched as `diagnostics`
are, each written like a diagnostic with the entry's `reason` and `entry`,
`{ file, line }`, beside it; `accepted: []` means nothing was accepted; the
`diagnostics` are what remain, and a case that gives none expects none, as
before), and optionally
`fixed`, as in the config conformance cases. A case that expects
`diagnostics` also checks `tables`, `previewFeatures`, `operations` and
`qualityResults` when it gives them.
All cases use the
data-only packs [conformance/pack.yaml](conformance/pack.yaml),
[conformance/pack-bridge.yaml](conformance/pack-bridge.yaml),
[conformance/pack-local.yaml](conformance/pack-local.yaml),
[conformance/pack-fold.yaml](conformance/pack-fold.yaml),
[conformance/pack-checked.yaml](conformance/pack-checked.yaml),
[conformance/pack-plain.yaml](conformance/pack-plain.yaml),
[conformance/pack-three.yaml](conformance/pack-three.yaml),
[conformance/pack-intent.yaml](conformance/pack-intent.yaml) and
[conformance/pack-ops.yaml](conformance/pack-ops.yaml),
[conformance/pack-databricks.yaml](conformance/pack-databricks.yaml) and
[conformance/pack-quality.yaml](conformance/pack-quality.yaml) and
[conformance/pack-zones.yaml](conformance/pack-zones.yaml), all
available. A
pack file with `buildEnvironments: true` stands for a pack that builds
environments together: the runner gives it a `buildEnvironments` member. A
pack or a method with `checks`, a list of messages, stands for one with a
`check` that returns them, for every model or table it is given. The pack
[conformance/pack-checked.yaml](conformance/pack-checked.yaml) has both.

A case MAY give `platformFields`, by pack id, the paths that pack lists in
this case only, in place of its own (section 7). When the packs are refused,
`expect.refused` is the error's message, exactly, and the message of the
`PACK_LOAD` error the check before resolving gives.

A case with `packProblems` in place of `files` gives the problems a pack's
`buildEnvironments` returns (section 2.1). `expect.diagnostics` are then the
diagnostics they become, exactly and in order, each written with its `code`,
`severity`, `message` and `hint`, and, when it has a location, its `file`,
`line` and `column`.

A case with `reference` in place of `files` checks the field reference
(section 10). `reference` is `{ kind: <Kind> }`, a document kind, or
`{ method: <id>, settings: <schema> }`, with optional `defaults` and
`placement`, a method of a data-only pack whose id is `reference`.
`expect.paths`, when given, is every entry's path, in order, exactly.
`expect.fields` are entries, each found by its `path` (keys joined with `.`),
compared on the keys given only; a key given as `null` is one the entry does
not have. `expect.absent` lists paths that have no entry.

## 10. Field reference

Tools describe each field of a document kind, and each setting of a pack's
method, from its JSON Schema, for the editor and the documentation alike, as
one entry per field. The schema's **branches** are the schema itself, then
those of its `allOf`, `anyOf` and `oneOf` items, its `then` and its `else`,
each in that order and each with a local `$ref` (`#/$defs/<name>`) replaced
by what it names, with the schema's own keywords beside the `$ref` kept.
Branches nest depth first: each branch is followed by its own branches
before the next branch, so the properties of an `anyOf` inside the first
`allOf` item come before those of the second `allOf` item.

**Entries, in order.** At each schema, the properties are those of all its
branches, in the order each first appears, a later branch's schema for a
name replacing an earlier one's. Each property is an entry, followed by the
entries under it. Then, for each branch in order, its `additionalProperties`
schema is an entry `*` under the mapping when that schema has a description,
allowed values, a `minimum`, a `maximum`, a `default` or an example, in
itself or any of its branches; then come the entries under its `items` and
under its `additionalProperties`, each at `*`. An entry under `*` whose path
an earlier one has is left out. A list's `items` schema is an entry `*` under
the list only when it has a `find` or a `suggest`, in itself or any of its
branches, so a value the owner writes one item at a time, such as an alert's
address, is explained; it comes after the `additionalProperties` entry.
Otherwise a list's `items` schema is never an entry of its own. A `$ref` already being followed further up is not followed again, so
a schema that contains itself, such as a column with nested columns, is
described once.

**What an entry has.**

- `path`: the keys from the root, with `*` for any key of a mapping or any
  list item; `name` is the last key.
- `required`: the name is in the `required` of the parent schema or of the
  items of its `allOf`, at any depth of `allOf`. A `*` entry is not required.
- `description`, `default`, `minimum`, `maximum`, the example (the first of
  `examples`) and `suggest`: from the field's schema, else from the first of
  its branches that gives it. Only the inclusive `minimum` and `maximum` are
  carried, not `exclusiveMinimum` or `exclusiveMaximum`. `suggest` is text for what a new
  value could look like, with `<placeholders>` for the parts the author fills
  in, such as `/Volumes/<catalog>/landing/<source>`; an entry has it only when
  a schema gives one.
- `find`: one sentence on where the owner finds the value, from the `find`
  annotation of the field's schema, else of the first of its branches that
  gives one (see Connector authoring metadata). An entry has it only when
  a schema gives one. The entry of a Connection's setting carries the `find`
  and the `suggest` of the connector's setting of that name, when the
  connector has them.
- `values`: the schema's `const` as the only value, else each of its `enum`,
  with the meaning at the same position in `enumDescriptions`; each taken
  from the field's schema, else the first branch that gives one.
- `type`, in words, as the table below gives it.
- `docs`: the page and anchor. For a document kind,
  `/docs/reference/documents#<anchor>` of the kind's name in lower case
  followed by the path; for a method,
  `/docs/reference/packs/<pack>#<anchor>` of the method's id followed by the
  path. The anchor joins the parts with `-`, each `*` written `item` and each
  other part in lower case with every run of characters other than `a` to
  `z` and `0` to `9` replaced by `-`.
- For a method's setting, `placement`: `platform` or `standard` when the
  method's `placement` lists the setting's top-level key there, else
  `definition`; and a top-level setting's `default` is the method's
  `defaults` value for it, when it has one.

A contract field's entry also carries Ingestron's own note on that field,
which the implementation keeps beside the ODCS schema.

**Type words.** When the schema, its `$ref` followed, has an `anyOf` or a
`oneOf`, the words are those of each of its items, each taken
together with the schema's own keywords other than `anyOf` and `oneOf`, the
item's keywords replacing the schema's own where both have one, each said
once, in order, and joined with `, or `: for example
`one of the values, or text`, and `a whole number, or never`. Otherwise the
schema's branches are merged, each keyword taken from the first schema that
has it: the schema itself, then each branch in order. The words are the
first of these that applies to the merged schema:

| The merged schema has                               | Words                               |
| --------------------------------------------------- | ----------------------------------- |
| `const`                                             | the value itself, as text           |
| `enum`                                              | `one of the values`                 |
| `type`, one or a list                               | each type's words, joined with `or` |
| `properties` or `additionalProperties`, and no type | `a mapping`                         |
| none of these                                       | `any value`                         |

| `type`    | Words              |
| --------- | ------------------ |
| `object`  | `a mapping`        |
| `array`   | `a list`           |
| `string`  | `text`             |
| `number`  | `a number`         |
| `integer` | `a whole number`   |
| `boolean` | `true or false`    |
| any other | the type, as it is |

## 11. Intent

Intent is what a standard, a flow or a transform says about how data is
loaded, kept and run, in words that belong to no engine. Every section is
optional; a document that leaves them all out behaves as it did before they
existed. Section 11.1 defines the words, section 11.2 how a value is
declared for each table, section 11.3 how the chosen methods fill what is left,
section 11.4 the method settings that are other names for intent, section
11.5 how each pack says what it does with each value, section 11.6 the
operations policy and quality results of the whole project and section 11.7
how a table's checks are judged. Which pack uses which is
in each pack's own specification.

### 11.1 Vocabulary

**Layers.** An item of the standard's `layers` is either a name (text matching
`^[a-z][a-z0-9_]*$`) or an object whose `name` is required and of the same
form. Layer names MUST be unique, whichever way each is written: a name that
an earlier item has is `DUPLICATE_LAYER`, an error at the later item
(`The layer "<name>" is listed twice.`, hint `Each layer is listed once; give a
layer's duties on its one entry.`). The standard's layers, in order, are the names: everything in this
specification that reads `layers` (a table's default layer, `UNKNOWN_LAYER`,
the `layer` naming variable) reads the names. An object may also give, as the
defaults for the tables in the layer, `history`, `audit`, `rescued`,
`retention` and `quality` (its `required`, `default`, `quarantine` and
`results`, as in the standard's `quality`; section 11.2 says how they apply),
and `does`, what the layer does with its rows (section 5):
`raw`, which keeps every row as it arrived, or a list of the duties
`cleanse`, `deduplicate`, `check` and `quarantine`, each at most once, and
`access`, who may use its tables (sections 5 and 8.2). A
`does` that is neither, or an empty list, is a load error at the value. An
object without a `name` is a load error at the item.

**Standard.** Beside `layers`, the standard may give:

| Field                                      | Meaning                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features`                                 | `ga` or `preview`: whether platform features in preview may be used.                                                                                                                                                                                                   |
| `origin`                                   | `{ standard, version }`: the published standard this one was made from.                                                                                                                                                                                                |
| `load`                                     | `default` (a load mode), `deletes` (a delete mode) and `when`, a list of rules, each with some of the facts `connectivity`, `connector`, `input` and `layer`, and `use`, a load mode. Rules are checked in order: the first whose facts all match chooses `load.mode`. |
| `audit`, `rescued`, `retention`, `storage` | The same as a layer's or a table's, for every table.                                                                                                                                                                                                                   |
| `quality`                                  | `required` and `default`, the actions for failed checks (section 6); `quarantine: true`, to keep rows a `drop` check removes in a table of their own (section 11.7); `results: true`, to keep the results of checks as a table.                                        |
| `cleanse`                                  | Defaults for the tables' columns (sections 6.1 and 6.3): `text`, with `trim: true` and `empty: null`, for every text column, and `timestamps`, with `to: <zone>`, for every timestamp column.                                                                          |
| `operations`                               | Policy for runs, below.                                                                                                                                                                                                                                                |
| `fixed`                                    | Intent that no layer, flow or transform may change: any of `load`, `history`, `sequence`, `audit`, `rescued`, `retention`, `storage` and `operations`, in the forms below. It is separate from each action's `fixed` settings.                                         |

**Flows and transforms.** A flow and a flow table may give `load`, `history`,
`sequence` and `audit`; a transform may give `history`, `sequence` and
`audit`. A flow table and a transform may also give `cleanse`, with `columns`
and `deduplicate` (sections 6.1 and 6.2), and `quality`, with `quarantine` and
`results` (section 11.2).

**Load.** How a flow table's data leaves the source. A table's `load` is
`{ mode, cursor, deletes: { mode, when } }`.

| Mode          | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `files`       | New files only, each read once.                                           |
| `incremental` | Rows whose `cursor` column is past the last value seen.                   |
| `changes`     | The source's change log or change feed.                                   |
| `full`        | The whole object each run; any history is derived by comparing snapshots. |

`deletes.mode` is `soft` (deleted rows are marked and kept), `hard` (removed)
or `keep` (deletes at the source are ignored). `deletes.when` is a SQL
condition that is true for a row deleted at the source.

**History.** What is kept per key; keys are the contract's primary key.
`none` keeps every row as it arrived, `latest` the latest row per key, `full`
every version, and `bitemporal` every version with valid and recorded time.
`sequence` is the column that orders changes to a key; without it the load
`cursor` orders them.

**Audit.** A list of the values `loaded_at`, `run_id`, `source_file`,
`source_modified_at`, `source_object`, `source_connection`, `window_start`,
`window_end` and `row_hash`, each as text or as `{ value, as }`. Each is a
column added after the contract's columns; it is not a contract column. Its
name is `_<value>` unless `as` gives another, which MUST match
`^[a-z_][a-z0-9_]*$`. Each column has a name of its own: once a table's intent
is resolved (sections 11.2 to 11.4), an entry of its `audit` whose name an
earlier entry has, or a column of the table's contract has (compared without
case), is `BAD_SETTING`, an error at that entry where it was written (at the
place the list was written when it came from a setting, and without a place
when it came from a pack's default):
`The audit column "<as>" is named twice.` or
`The audit column "<as>" has the name of a contract column.`, with the hint
`Give each audit column a name of its own with "as".` The table is still
resolved.

**Rescued.** `rescued: true` keeps data that does not fit the contract in a
rescued column instead of losing it.

**Retention.** `time_travel`, `log` and `landed_files`: how long earlier
versions of a table, its change log and the files an ingest step landed are
kept. Each is a duration.

**Storage.** `clustering` is `auto` (the platform chooses), `none`, or `keys`
(the contract's partitioned columns). `features` lists any of `change_feed`,
`row_tracking`, `deletion_vectors`, `type_widening` and `iceberg_reads`.

**Operations.** Policy for runs. Values that differ per environment, such as a
cron expression or where an alert goes, belong in the platform.

| Field          | Meaning                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule`     | `{ per }`: `project` for one schedule, `flow` for one per flow.                                                                                |
| `trigger`      | `schedule`, `files`, `upstream` or `continuous`.                                                                                               |
| `retries`      | `{ count, interval }`: tries again and the wait between them.                                                                                  |
| `timeout`      | How long a run may take before it is stopped.                                                                                                  |
| `alerts`       | `{ on, slow_after }`: `on` lists `failure` and `slow`; `slow_after`, the duration after which a run is slow, is required when `on` has `slow`. |
| `concurrency`  | `{ max_runs, queue }`: the most active runs, and whether one over the limit waits instead of being skipped.                                    |
| `require_tags` | Tags the platform must give a value for.                                                                                                       |

A **duration** is a whole number and a unit, `s`, `m`, `h` or `d`, matching
`^[0-9]+(s|m|h|d)$`, such as `30d`.

**Paths.** Every intent path and its values are listed in the implementation
as `intentPaths`, for coverage maps: `load.mode`, `load.cursor`,
`load.deletes.mode`, `load.deletes.when`, `history`, `sequence`, `audit`,
`rescued`, `retention.time_travel`, `retention.log`, `retention.landed_files`,
`storage.clustering`, `storage.features`, `operations.schedule`,
`operations.trigger`, `operations.retries`, `operations.timeout`,
`operations.alerts`, `operations.concurrency` and `quality.results`, and the
quality and cleansing paths of section 11.7: `quality.rules` (values
`notNull`, `in`, `notIn`, `pattern`, `length`, `range`, `multipleOf` and
`items`, the rule kinds of section 6), `quality.actions` (`warn`, `drop`,
`fail`), `quality.table-checks`, `quality.quarantine`, `cleanse.trim`,
`cleanse.empty`, `cleanse.map`, `cleanse.case`, `cleanse.default`,
`cleanse.timezone` and `deduplicate` (each with the one value `true`), and the
access paths of section 8.2: `access.grants` (`read`, `write`),
`access.exact` (`true`), `access.masks` (`null`, `hash`, `redact`,
`function`) and `access.filters` (`true`). A value of `*` stands for any text.

### 11.2 Precedence

Each table's declared intent is resolved before any method is chosen, from
these layers, a later one winning over an earlier one. Mappings are merged key
by key, so a flow's `load: { cursor }` leaves the load mode the standard gave;
a list (`audit`, `storage.features`) is replaced whole.

1. `standard`: the standard's `load.default` (as `load.mode`), `load.deletes`
   (as `load.deletes.mode`), `audit`, `rescued`, `retention` and `storage`.
2. `layer`: the standard's object for the table's layer (`history`, `audit`,
   `rescued`, `retention`). A layer written as a name gives nothing.
3. `rule`: the first of the standard's `load.when` rules whose facts all match
   the table; its `use` is `load.mode`. The facts are the table's `connectivity`
   and `connector` (its connection's) and `layer`. A fact the table does not
   have does not match, so a rule that names `input` never matches here.
4. `definition`: the flow's or the transform's `load`, `history`, `sequence`
   and `audit`.
5. `table`: the flow table's own `load`, `history`, `sequence` and `audit`.
6. `fixed`: the standard's `fixed` intent.

The pack's own intent defaults come after methods are chosen and fill only
what these layers left unset (section 11.3); they are not part of declared
intent. A
transform's table has no `load`: the standard's `load` sections and `fixed.load`
do not apply to it.

An audit entry written as a bare value becomes `{ value, as: "_<value>" }`, so
every resolved entry names its column.

A value that holds a deploy-time value (section 1.1) in a value that decides
what is generated (`load.mode`, `load.deletes.mode`, `history` and the items
of `storage.features`) is not declared: it sets nothing, and is `DEPLOY_VALUE`
when resolving for deploy. Any other value, such as a `cursor`, may hold one.

**Fixed intent.** A flow, flow table or transform that gives a value different
from the standard's `fixed` value at the same path is `FIXED_SETTING`, an error
at that value, with the message `The standard fixes "<path>" to <value>.`
(the path joined with `.`, the value as JSON, as for settings) and the fix
`Remove this setting`. Mappings are compared key by key, so keys beside the
fixed ones are allowed. A value that holds an unset reference changes nothing,
except when resolving for deploy (section 1.1). Layers and rules of the
standard may differ from `fixed`: it wins. The table is still resolved, with
the fixed value.

**Resolved intent.** Each table has `intent`, the values above in the shape of
section 11.1, completed as sections 11.3 and 11.4 say (`{}` when nothing is
declared and no method gives a default), and `intentOrigins`, for each
intent path that has a value, the layer that last set it (`standard`, `layer`,
`rule`, `definition`, `table` or `fixed`; `platform` for an aliased setting in
the platform; `pack` for a method's default) with the `file` and `line` where
it was written (none for `pack`). The paths are those of `intentPaths`: `load.mode`, `load.cursor`,
`load.deletes.mode`, `load.deletes.when`, `history`, `sequence`, `audit`,
`rescued`, `retention.time_travel`, `retention.log`, `retention.landed_files`,
`storage.clustering` and `storage.features`; a list has one origin, under its
path. The origin's layer name `layer` is used only for intent. Comparing
targets (section 2.1) leaves `intentOrigins` out, as it leaves out `origins`.

**Quality.** The actions of a table's checks, its quarantine and its results
are merged the same way, from the standard's `quality`, the `quality` of the
table's layer (a layer written as an object) and the `quality` of the flow
table or transform, a later one winning. They are not part of `intent`.

- `required` and `default`, the actions of the table's checks (section 6): the
  pack's defaults, then the standard's, then the layer's. An action a flow
  table or transform writes on its own expectation (`action`) wins over all of
  them. The layer's `default` also decides its table checks, as the
  standard's does (a table check fails when the default is `fail`, and
  otherwise warns). After that, a table whose `does` lacks `check` has every
  action `warn` (section 5).
- `quarantine` and `results`, each `true` or `false`: the standard's, then
  the layer's, then the flow table's or transform's. Section 11.7 says where
  `quarantine` reaches. The standard's `results` reaches every table.

Each table has `qualityOrigins`, the origin (as `intentOrigins` has) of each of
`required`, `default`, `quarantine` and `results` that the standard, its layer
or the table writes: the layer that last set it (`standard`, `layer`,
`definition` for a transform, `table` for a flow table) with the `file` and
`line` where it was written. A key nothing wrote is absent, and so is
`qualityOrigins` when there are none. It is not a value in generated files:
comparing targets (section 2.1) leaves it out. The table's `quality` holds the
`quarantine` and `results` that were written, `{ quarantine?, results? }`, and
is absent when neither was.

### 11.3 Pack defaults

A method MAY give `intentDefaults`: intent, in the shape of section 11.1,
that it applies when nothing declares it (the conformance pack's `stream`:
`history: none`). Once every step of a table has its method and settings, the
declared intent (section 11.2) is completed in this order:

1. each chosen method's aliased settings become intent at their places
   (section 11.4);
2. the aliased settings of the packs' own rules fill every intent path still
   unset, with the origin `pack` (section 11.4);
3. the chosen methods' `intentDefaults` fill every intent path still unset.
   When several steps give a default for the same path, the step that judges
   the path gives it: the ingest step for `load.mode`, `load.cursor` and
   `retention.landed_files`; the store step for `load.deletes.*`, `history`,
   `sequence`, `storage.*`, `retention.time_travel`, `retention.log` and
   `rescued` (else an ingest step that produces the table); for any other
   path, or when the judging step gives none, the later step (in the order
   ingest or transform, store, serve). A path filled this way has the origin
   `pack`, with no file or line;
4. each chosen method's aliased settings are written from the result
   (section 11.4).

Pack defaults are not rule facts (section 4): they come after the methods are
chosen. A table whose steps are not known (section 1) has no chosen methods,
so nothing is filled. A table whose steps cannot be resolved is not in the
model, and none of this applies to it.

### 11.4 Aliases

A method MAY declare `aliases`: settings that are other names for intent, by
setting. An alias is one of:

- `{ path }`: the setting's value is the value at that intent path
  (`sequence_by: { path: sequence }`);
- `{ values }`: each listed value of the setting stands for a piece of intent
  (`mode: { values: { append: { history: none }, upsert: { history: latest } } }`).
  A value not listed stands for nothing.

**Reading.** An aliased setting is intent written at the place the setting is
written, and takes that place's position in the precedence of section 11.2:
the standard's and the platform's `settings.<method>` are `standard`, the
matching `when` rule's `with` is `rule`, the flow's or transform's
`<action>.with` is `definition`, the flow table's `<action>.with` is `table`,
and the standard's `fixed.<method>` is `fixed`. At one position the setting
comes before intent written as intent, so a flow's `store.with.mode: append`
overrides a layer's `history: latest`, as the flow's own `history` would. The
origin is the place (`platform` for the platform's settings), with the file
and line of the setting. A method's own `defaults` are not intent. A value
that holds an unset reference (section 1) stands for nothing, as in section
11.2. Aliases are not rule facts (section 4).

**A pack's rules.** A pack's own `when` rule may write `with` (section 4).
Its aliased settings are not declared intent: they are read as intent with
the origin `pack`, naming the setting as `alias`, with no file or line, after
the declared intent and the aliased settings at their places and before the
methods' `intentDefaults` (section 11.3). So they fill only what is still
unset, and win over a method's defaults: the conformance pack's rule
`{ connector: stream, use: stream-read, with: { mode: append } }` makes
`history: none` the table's intent when nothing declares another. Like a
pack's default, such a value is not judged (section 11.5) and is not
`SETTING_MOVED`.

**Origins.** The origin of a value that came from an aliased setting also
names the setting, as `alias` (`mode`), beside the layer, file and line of the
setting. The origin of intent written as intent, and of a pack's default, has
no `alias`, and neither has a value that a later place wrote as intent, whose
origin is that place's. So a pack can tell intent written as intent from a
setting that means the same. A pack MUST NOT change what it generates for a
value whose origin has `alias`, compared with the same setting before intent
existed.

**`SETTING_MOVED`.** Each aliased setting outside the standard's `fixed` is
`SETTING_MOVED`, a warning at the setting: `"<setting>" is now written as
intent: <intent>.`, the intent written as `<path>: <value>`, joined with
`, `. Intent reaches more than the setting did: written for a whole standard,
layer or transform, it also applies to other methods and steps, which may
read it where the setting meant nothing to them. So a fix is offered only
in a flow's `ingest.with`, `store.with` or `serve.with`, or a flow table's
`<action>.with`, where the intent covers only that flow's tables. Its fix,
`Write as intent`, writes the intent as the flow's or the table's own intent
and removes the setting. Elsewhere (the standard's `settings.<method>`, the
platform, a rule's `with`, a transform's `<action>.with`) there is no fix;
nor is there one when the setting is written as, or with, a `${…}`
reference, which intent cannot keep. Without a fix, the hint is
`Write the intent by hand where it should apply, and remove this setting.`

The standard's `fixed.<method>` is not `SETTING_MOVED`: it is read as fixed
intent for that method's tables and keeps its force as it is written.

**`INTENT_CONFLICT`.** An aliased setting whose intent differs from intent
written as intent at the same place (the same flow, flow table or transform,
or the standard's top-level sections or `fixed`) is `INTENT_CONFLICT`, an
error at the setting: `"<setting>: <value>" means <intent>, but this <place>
also says <intent>.`, the place being `flow`, `transform`, `table` or
`standard`, and the second intent the differing paths as written. Its fix is
`Remove this setting`. The setting then counts as no intent and is not
`SETTING_MOVED`.

**Fixed.** The standard's `fixed.<method>.<setting>` for an aliased setting is
fixed intent for that method's tables: a flow, flow table or transform that
writes the intent differently is `FIXED_SETTING` at its value, with the
message of section 11.2 (`The standard fixes "history" to "none".`). An
aliased setting in a flow's, transform's or flow table's `with` whose intent
differs from the standard's `fixed` intent is `FIXED_SETTING` at the setting,
and counts as no intent. A definition's setting that differs from
`fixed.<method>` is `FIXED_SETTING` as a setting (section 3), and the step
does not resolve.

**Writing settings from intent.** Last, each aliased setting of each chosen
method is written from the completed intent. A `path` alias takes the value
at the path; a `values` alias the first listed value whose intent the
completed intent holds, and that value's intent paths are the ones that
count. At least one of those paths MUST have an origin other than `pack`, and
the setting's origin becomes the origin, other than `pack`, that comes latest
in the precedence (section 11.2). So a setting is never written from pack
defaults alone, and a project that declares no intent keeps the settings it
had. The setting keeps its merged value when:

- the path has no value, or no listed value matches (`history: full` for
  `mode` above);
- the setting holds an unset reference (section 1): it stands for no intent,
  but is kept as written;
- the last place that wrote it (section 3) comes later in the precedence than
  that origin, the platform's settings counting as the standard's: such a
  setting either is the intent at its place or stands for none, and is kept;
- the last place that wrote it is a pack's rule: the pack chose that value,
  and intent never changes it;
- the last place that wrote it (not a method's `defaults`) wrote a value that
  a `values` alias does not list: it stands for no intent, and intent never
  changes it.

**Not applied.** Intent that a setting kept for one of the last two reasons
does not follow is `NOT_APPLIED`, a warning at the intent's value where it
was written, `<pack>` being the step's pack:

- kept for a pack's rule: each path of the intent the rule's value stands for
  whose value has an origin other than `pack` and differs, or, for a value
  the alias does not list, the path the setting would have been written from
  when that gives another value:
  `<path>: <value> isn't applied on <pack>: the pack's rule for <facts> writes "<setting>: <value>".`,
  the rule's facts written `<fact> <value>` and joined with "and"
  (`connector kafka`);
- kept for a value the alias does not list: when the completed intent would
  have written another value, from a path whose origin comes at the same
  place as the setting's last writer or later:
  `<path>: <value> isn't applied on <pack>: the setting "<setting>: <written value>" in <file> decides it.`,
  the file being where the setting was written last.

A value reported here is not judged again (section 11.5).

A written value the method's settings schema refuses is `BAD_SETTING` where
the intent was written: `Settings for "<method>": the intent written here
makes "<setting>" <value>, which the method does not accept.`, and the
setting keeps its merged value. Only failures of that setting count, so a
setting elsewhere that holds an unset reference does not make it one.

### 11.5 Coverage

A pack MAY declare `intent`, beside `contract`: what it does with each intent
path and value, keyed by the path (`history`) or by the path and a value
(`history=full`), the paths and values of `intentPaths` (section 11.1). Each
entry is one of:

- `{ use: used, does, status }`: the pack applies it, and `does` says how.
  `status`, optional, is the platform feature's release status:
  `{ level, label, checked, source }`, `level` being `ga` or `preview`,
  `label` for a preview (`Public Preview`, `Beta` or `Private Preview`),
  `checked` the date it was checked and `source` the page that says so.
  `onlyWhere`, optional, is one of the layer duties `check`, `cleanse`,
  `deduplicate` and `quarantine`: the pack applies it only in a layer whose
  `does` lists that duty, or, for `check`, whose `does` is `raw` (section 5).
  It is read only for the paths of section 11.7.
  `zonesNotApplied`, optional, is read only on the entry for
  `cleanse.timezone`: the zones the pack cannot convert from or to, each with
  its reason, such as `{ Antarctica/Troll: Windows has no zone for
Antarctica/Troll. }`. A conversion from or to a listed zone is not applied
  (section 6.3); every other conversion is;
- `{ use: not-yet, reason }`: the pack does not apply it yet;
- `{ use: elsewhere, reason }`: another step or pack does it;
- `{ use: not-applicable, reason }`: it means nothing on the pack's platform.

A method MAY declare `intent` in the same form, for what differs on that
method from the pack. The entry for a path and value is found in this order:
`path=value`, then `path`, then each path above it, nearest first (`load.cursor`
takes `load`'s entry), first in the method's `intent`, then in the pack's.
Every pack's own tests SHOULD check that its `intent` covers every path and
value; the implementation gives the gaps as `intentCoverageGaps`. A value of
`*` in `intentPaths` is covered by the path's entry.

**Judging.** Once a table's intent is completed (sections 11.3 and 11.4),
each value whose origin is not `pack` is judged by one step, the step whose
method applies it:

- the ingest step: `load.mode`, `load.cursor`, `retention.landed_files` and
  the `audit` values `run_id`, `window_start`, `window_end`, `source_object`
  and `source_connection`;
- the store step, else the ingest step (when it produces the table or the
  table ends at the landed files): `load.deletes.*`, which the step that
  writes the table applies, `history`, `sequence`, `storage.*`,
  `retention.time_travel`, `retention.log`, `rescued` and the `audit` values
  `loaded_at` and `row_hash`;
- the store step when the ingest step produces files, else the ingest step:
  the `audit` values `source_file` and `source_modified_at`.

Section 11.3 takes the same step for a path when two steps give a default,
except that there the ingest step stands in for the store step only when it
produces the table. A table that ends at the landed files has the ingest step
as its last step, so it judges every value.

**A transform's table.** A table with no ingest step, a transform's, reads no
source, so no step can give the `audit` values only a step that reads the
source gives: `source_file` and `source_modified_at`, and `run_id`,
`window_start`, `window_end`, `source_object` and `source_connection`. Each
such value whose origin is not `pack` is `NOT_APPLIED` at the place it was
written, without asking any pack:
`audit: <value> isn't applied on <pack>: A transform's table reads no source;
<value> comes from a step that reads the source.`, where `<pack>` is the id of
the pack of the table's store step, else of its transform step. `loaded_at`
and `row_hash` are judged by the store step as above.

Each item of a list (`audit`, `storage.features`) is judged as its own
value. A value of a path with `*` is judged on the path. A value that is not
one of the path's values in `intentPaths` (such as `rescued: false`) and a
path no step judges are not judged; nor is any value of a table that holds
an unset reference (section 1), except when resolving for deploy (section
1.1), nor of a table whose steps are not known.

**`NOT_APPLIED`.** A warning at the value, where it was written:

- when the entry found is `not-yet` or `not-applicable`:
  `<path>: <value> isn't applied on <pack>: <reason>`, where `<pack>` is the
  judging step's pack's id;
- when the entry found is `used` in the pack's `intent` (not the method's),
  or there is none, and the judging step's method has an alias (section 11.4)
  whose `values` give the path, but no alias stands for the value:
  `<path>: <value> isn't applied on <pack>: "<method>" has no setting for it.`
  A `path` alias at the path, or above it, stands for every value.

An `elsewhere` entry, and a path and value with no entry and no such alias,
report nothing: whether a pack covers every value is its own tests' concern,
not the project's.

**`PREVIEW_FEATURE`.** The standard's `features` says which release status a
project may use: `ga` or `preview`. With `features: ga`, a judged value whose
entry is `used` with a `status` whose `level` is `preview`, and that is not
`NOT_APPLIED`, is
`PREVIEW_FEATURE`, a warning at the value: `<path>: <value> is <label> on
<pack> (checked <checked>); this standard uses only generally available
features.` (`in preview` when the status has no `label`), with the fix
`Allow preview features`, which sets the standard's `features` to `preview`.
With `features: preview`, or without `features`, nothing is reported.

**Preview features.** The model's `previewFeatures` lists each such value,
whatever `features` says: its
`table`, `path`, `value` (left out for a path with `*`), the judging step's
`pack` and the `status`, in the order of the tables, then of `intentPaths`.
It is `[]` when there are none.

### 11.6 Operations

The model's `operations` is the standard's `operations` (section 11.1) with
its defaults filled, and `fixed.operations` over it, key by key inside a
mapping (section 3). Its fields are `schedule`, `trigger`, `retries`,
`timeout`, `alerts`, `concurrency` and `require_tags`. When the standard says
nothing, `schedule` is `{ per: project }`, `trigger` is `schedule`, `alerts`
is `{ on: [failure] }` and `require_tags` is `[]`; `retries`, `timeout` and
`concurrency` are absent. The model's `qualityResults` is `true` when the
standard's `quality.results` is `true`, and `false` otherwise.

**Slow alerts.** `alerts.on` with `slow` and no `alerts.slow_after`, in the
standard or in `fixed.operations`, is a schema error at the `alerts` mapping
(`operations.alerts needs "slow_after".`).

**Required tags.** Each tag in `require_tags` that the Platform's `tags` does
not give is `BAD_SETTING`, an error at the Platform's `/tags` (at the document
root when it has none, and at no place when the project has no Platform
document): `The standard requires the tag "<tag>" on every platform.`

**Judging `operations`.** The judging pack is the first pack in the standard's
list whose `intent` (section 11.5) declares `operations`, or a path below it,
`used`. Each value of the policy other than a default is judged by the entry
found for its path and value, as section 11.5 finds it in the pack, and
reported as it says (`NOT_APPLIED`, `PREVIEW_FEATURE`) at the value, where the
standard wrote it (`/operations/...`, or `/fixed/operations/...` when it fixes
the value). A pack with no entry reports nothing. The values judged are the
`schedule` when it is `flow`; a `trigger` other than `schedule`; `retries`,
`timeout` and `concurrency`, as set; and each alert in `alerts.on` other than
`failure`. The paths are `operations.schedule` (value `flow`),
`operations.trigger`, `operations.retries`, `operations.timeout`,
`operations.alerts` (value the alert) and `operations.concurrency`.

When no pack of the standard declares any `operations` path `used`, each such
value is `NOT_APPLIED` at the standard, naming the first pack in its list:
`<path>: <value> isn't applied on <pack>: <reason>`, where the reason is that
pack's own `not-yet` or `not-applicable` entry for it, else `No pack of this
standard runs jobs.` An `elsewhere` entry of the first pack reports nothing.

**Judging `quality.results`.** Each table whose `quality.results` is `true`
(section 11.2) has its store step judged by its method's entry, else its
pack's, for `quality.results` (section 11.5), reported where that value was
written (`/quality/results` in the standard, `/layers/<n>/quality/results` in a
layer, `quality/results` in a flow table or transform):
`quality.results: true isn't applied on <pack>: <reason>`. It is reported once
for each place, pack and reason. A pack with no entry reports nothing. The
model's `qualityResults` stays the standard's own value, and says nothing of
tables that turn results on or off.

### 11.7 Quality and cleansing

A table's checks (section 6) are judged by the step that keeps the table: its
store step, else its ingest step when that step produces the table. The
entry for each path and value is found as section 11.5 finds it, first in
that step's method, then in its pack. A table that ends at the landed files
is not judged this way (section 6 says what it reports), nor is a table whose
steps are not known, nor one that holds an unset reference, except when
resolving for deploy (section 1.1). The values judged, in this order, are:

- for each expectation in the table's order, the `kind` of its `rule`
  (`quality.rules`), at the place the rule was written: a required column's
  `required`, an option's key in `logicalTypeOptions`, or the rule's item in
  a `quality` list; then its action (`quality.actions`), at the place the
  action was written: the expectation's own `action` in a flow table or
  transform, else the layer's or the standard's `quality.required` (for a
  required column) or `quality.default` (for any other). When the action is
  the pack's default, nothing wrote it: it is judged at the place of the
  expectation's rule, and an expectation with no rule has its action judged
  only when the action was written. An expectation whose rule kind is
  `NOT_APPLIED` here is not judged on its action: the rule is not applied, so
  neither is its action. An expectation with no `rule` is judged on its action
  only;
- for each table check, `quality.table-checks` (value `true`) at its rule (a
  column's `unique` for its `duplicateValues` check), then its action. A
  table check's action is part of the table check: a pack that runs table
  checks runs each with its action, so the action is judged against
  `quality.table-checks` (value `true`), as `The <action> action`, with the
  feature the action, not against the row checks' `quality.actions`. It is
  judged at the layer's or the standard's `quality.default` when the action is
  the one written there, else at the table check's own place. A table check
  whose metric is `invalidValues` with a `pattern` (text) counts the values
  that do not match it, which needs the same regular expressions as a row
  check's `pattern`, so after `quality.table-checks` it is also judged as the
  rule kind `pattern` (`quality.rules`, value `pattern`), at its rule, as
  `The pattern rule`, with the feature `pattern` (case 140i). A table check
  whose `quality.table-checks` or `pattern` is `NOT_APPLIED` is not judged on
  its action, and an action with no place at all is not judged.

Each value is reported as follows, with the subject (section 1.2)
`{ table, feature }`, `feature` being the rule kind, the action or
`table-checks`:

- when the entry found is `not-yet` or `not-applicable`, `NOT_APPLIED`, a
  warning at the place: `The <kind> rule isn't applied on <pack>: <reason>`,
  `The <action> action isn't applied on <pack>: <reason>` or
  `The table check isn't applied on <pack>: <reason>`, where `<pack>` is the
  keeping step's pack's id;
- when the entry found is `used` with `onlyWhere` and the table's `does`
  (its layer's duties) does not list that duty, `NOT_APPLIED` the same way,
  with the reason `it is applied only in a layer whose does lists <duty>.`
  and the hint ``Add `<duty>` to the layer's `does` to apply it here.``
  A table whose layer gives no duties lists none. A `does` of `raw` meets
  `onlyWhere: check`: its checks count, each with the action `warn`
  (section 5), so a pack that counts checks where a layer checks counts them
  there too (case 140h);
- when the entry found is `used` with a `status` whose `level` is `preview`,
  and the standard says `features: ga`, `PREVIEW_FEATURE` as section 11.5
  says, with `The <kind> rule`, `The <action> action` or `The table check`
  in place of `<path>: <value>`;
- an `elsewhere` entry, and a value with no entry, report nothing.

The same warning at the same place is reported once (section 1.2).

Cleansing and deduplicate (sections 6.1 and 6.2) are judged by the same step, for
the paths `cleanse.trim`, `cleanse.empty`, `cleanse.map`, `cleanse.case`,
`cleanse.default`, `cleanse.timezone` (section 6.3) and `deduplicate`, each with
the value `true`. An entry that is
`used` with `onlyWhere: cleanse` or `onlyWhere: deduplicate` is `NOT_APPLIED` in a
table whose `does` does not list that duty, with the reason `it is applied only in
a layer whose does lists <duty>.` and the hint ``Add `<duty>` to the layer's `does`
to apply it here.``

**What is not applied, in the model.** Each table in the model has
`notApplied`: one item for each feature that a `NOT_APPLIED` warning about the
table reports (this section, sections 6, 6.1 to 6.3, 11.4 and 11.5), with the
warning's `feature` (section 1.2), its `reason` as the pack or the
specification gives it, and, for a time zone conversion (section 6.3) and a
mask (section 8.2), the `column` it is not applied to, one item for each such
column. It is recorded
as each warning is reported for the table, before warnings about several
tables lose their `table` (section 1.2), so it says exactly which tables a
feature is not applied on. The same feature, reason and column is listed once.
`notApplied` is absent when the table has none. It does not depend on the
Platform's `accept` list: an accepted warning is still listed. The passport
reads it to say what is not enforced.

**Quarantine.** `quality.quarantine: true` (section 11.2) keeps the rows that
fail a check whose action is `drop` in a table of their own, with the names of
the checks they failed, instead of losing them. It reaches a table as follows:

- Written on a flow table or a transform, it asks for the table's layer to
  quarantine. When the table has `does` and it does not list `quarantine`, it
  is `LAYER_RESPONSIBILITY` (section 5), an error at the setting, whose message
  is `The layer "<layer>" does not list quarantine in its does, so quarantine
cannot be set here.` and the table has no quarantine. A table whose layer
  gives no `does` quarantines.
- Written on a layer, it reaches the tables of that layer. When that layer
  gives `does` and it does not list `quarantine`, it is the same error at the
  layer's setting (`/layers/<n>/quality/quarantine`), reported once, and the
  layer's tables have no quarantine from it.
- Written on the standard, it reaches only the tables whose layer's `does`
  lists `quarantine` and that do not end at the landed files. For every other
  table, including one whose layer gives no `does`, it is silent: no error, no
  warning, and nothing in the model. A
  layer or a table that writes `quarantine: false` wins over it, as section
  11.2 says.

Only `true` asks for the duty; `false` is never an error. The table's
`quality.quarantine` is the value that reaches it (`true` or `false`), with its
origin in `qualityOrigins`.

A table whose `quality.quarantine` is `true` and none of whose expectations has
the action `drop` (a table check never drops) has no quarantine table. When
`quarantine: true` was written on the table itself or on its layer, that is
`QUARANTINE_UNUSED`, a warning at the place `quarantine` was written, `No check
drops rows, so nothing is quarantined.`, with the hint `Set a check's action to
drop, or remove quarantine.` When it reaches the table from the standard, it is
silent: the author of a standard cannot know which tables have a `drop` check,
and the table still says in the model that it asks for quarantine. Otherwise
the table has `quarantine`
in the model: `{ fullName, column }`. `fullName` is the table's own full name
with `_quarantine` added to its table name, in the same catalog and schema
(`<table>_quarantine`), and `column` is `_failed_checks`, the column that holds
the names of the checks a row failed. The model only says what is wanted; a
pack that builds the table declares `quality.quarantine` (section 11.5), and
the table's keeping step is judged for it as section 11.7 judges the rest, at
the place `quarantine` was written, `Quarantine isn't applied on <pack>:
<reason>` with the subject feature `quarantine`, `onlyWhere` and `status` as for
any other value. On a table that ends at the landed files, it is `NOT_APPLIED`
on the ingest step's pack with the reason and hint that section 6 gives for a
check there, whatever any pack says.

## Accepted warnings

The platform team can accept a warning it has looked at and decided to live
with, and say why. Accepting a warning takes it out of the problem lists; it
does not change what the definitions mean or what is generated. Section 1.2
says what a warning is about, which is how an entry finds it.

**The list.** The Platform has a top-level `accept` list (section 7: empty
unless written). It belongs to the Platform because the platform team owns
what its platform cannot do or does not turn on. Each entry is a mapping:

- `code` (required): a problem code, such as `NOT_APPLIED`.
- `about` (optional): narrows the entry, with any of `file`, `table` and
  `feature` (below).
- `reason` (required): text that is not empty. A missing or empty reason is an
  ordinary schema error (`SCHEMA`) at the entry, from the Platform's schema.

```yaml
# platform.yaml
accept:
  - code: NOT_APPLIED
    about: { feature: fail, table: orders }
    reason: checks.sql runs from CI after each landing and pages the on-call team.
  - code: CAPABILITY_OFF
    about: { feature: tags }
    reason: The platform team applies Unity Catalog tags with its own Terraform.
  - code: NOT_APPLIED
    about: { file: "flows/legacy/**" }
    reason: Legacy flows are retired in March; no new rules are added.
  - code: NOT_APPLIED
    about: { feature: grants }
    reason: Local DuckDB with synthetic data; access is enforced in test and prod.
```

**Matching.** Matching runs once, at the end of loading and resolving, over the
problems of the result, so it sees the loader's warnings, the resolver's and
the warnings for `{{ … }}` and `REPLACE_ME` alike. An entry accepts a problem
when all of these hold:

1. The problem is a warning. An error, or information, is never accepted.
2. Its `code` equals the entry's `code`.
3. Each key of `about` matches:
   - `file`: a glob pattern matched against the file of the problem's
     location, relative to the project folder, by the one rule `imports`
     follows (the configuration specification, section 2): the pattern is
     normalised first, so `./flows/**` is `flows/**`, and a pattern that
     `imports` would refuse matches nothing; `*` matches any characters except
     `/`, `**` matches any number of folders, `?` matches one character except
     `/`. A problem without a location does not match.
   - `table`: equals the problem's `subject.table`.
   - `feature`: equals the problem's `subject.feature`.

Without `about`, an entry accepts every warning with that code. A key that
`about` does not give is not checked; a problem without the subject field a
key names does not match. A warning from loading has no subject, so only
`code` and `file` can accept it. A warning matched by more than one entry is
accepted by the first of them in the list.

**Which codes.** Each code has the levels it is ever reported at, recorded with
its meaning in the code help (`severities`: `error`, `warning`,
`information`), and where it is reported (`origin`): `resolve` for a code that
loading and resolving report, `build` for one that only a pack's building of
the files reports (`ENVIRONMENTS_DIFFER`, `ARM_PARAMETERS`, `SECRET_NAME_DIFFERS`
and `PACK_NOTICE`; section 2.1). A
loading code is reported by loading, which is part of resolving. An entry
accepts only the warnings of its code. Its `code` is `ACCEPT_CODE`, an error
at the entry's `code`, when:

- it is not a code this package or the loader reports;
- it is a code that is never a warning, so there is nothing to accept;
- it is `ACCEPT_CODE` or `ACCEPT_UNUSED`, which cannot be accepted, so that a
  stale list always shows;
- it is a code that is no longer reported (`CONTRACT_FIELD_UNUSED`).

A code that is a warning in one place and an error in another, such as
`DEDUPLICATE_MODE` or `REPLACE_ME`, is allowed: its entry accepts only the
warnings. A warning whose origin is `build` is not among the problems of a
result, so matching here never sees it. Its entry is valid, is not judged
unused here, and is given to the tool that builds the files, in the result's
`acceptAtBuild` (below): that tool matches the packs' warnings with the same
rules, and judges the entry unused there (the command line's output folders
specification, section 3).

An entry with an invalid code accepts nothing. The error stops the project
resolving, as any error does, and the result has no model.

**Unused entries.** An entry that matches no warning in the run is
`ACCEPT_UNUSED`, a warning at the entry, so that a list does not outlive the
warnings it was written for. An entry whose code's origin is `build` is not
judged here. An entry that another entry already accepts the
same warning for still matches it and is used. `ACCEPT_UNUSED` is judged for
the selected environment only, and only when the project resolved without
errors (an `ACCEPT_CODE` error counts), since errors can leave warnings unreported. When the project is
resolved for each environment, an entry for one environment's warning is
therefore unused in another. To accept different warnings per environment,
write the list as a value: `accept: ${values.accept}`, with the environments
overriding `values.accept` (in the configuration specification, a list
replaces the earlier value, section 2, and a reference that is the whole value
keeps the list's type, section 4.2). The fix of `ACCEPT_UNUSED`, `Remove the entry`, is
given when the list is written in the Platform's file itself, and not when it
comes from a value or an included file.

**The result.** The result of resolving has `diagnostics`, the problems that
remain, and `accepted`: one item for each accepted warning, in the order it was
reported, with the warning itself (`diagnostic`, with its `subject`), the
entry's `reason` and the `entry`, `{ file, line }`, where the entry is written.
Through `${values.accept}` the entry is at the reference. `accepted` is empty
when nothing was accepted, and when there is no Platform, or the project does
not load: nothing is accepted then. When the list has valid entries whose
code's origin is `build`, the result also has `acceptAtBuild`: each such entry,
in the list's order, with its `code`, `about` and `reason`, where it is written
(`entry`, as above), and `unused`, the `ACCEPT_UNUSED` warning to report when
no warning of a build matches it, with its fix as above. The package also
gives the matching itself, `acceptsWarning(entry, warning)`, true when the
entry accepts the warning by the rules above, so that a tool matches the
packs' warnings exactly as resolving matches its own. The tools read this one result, so they
agree: the command line prints a summary line, `<n> accepted warnings
(platform.yaml)`, and leaves accepted warnings out of its problem lists, out
of the editor's marks and out of the problems that `compare` shows. A run never
fails because of warnings, so accepting one changes no exit code.

**What accepting does not change.** The passport still says `not enforced`
for an accepted `NOT_APPLIED` or `CAPABILITY_OFF`. Accepting quiets the
warning; it does not make the feature enforced.

## Connector authoring metadata

A connector's settings metadata may mark a field `optional`, give its primitive
`type` (`text`, `number`, or `object`), and list allowed text `values`. Absence of
`optional` means required for the connector's default authentication path;
conditional fields explain the condition in their description. Snippets include
only that default path's required fields. This metadata describes authoring;
the selected method still validates the resolved definition.

Three more fields serve project creation and the editor, all optional:

- `default`: a value `ingestron init` writes for the setting, a number, `true`
  or `false`, or one of its `values`. It is a choice that suits most projects,
  not a stand-in for a value only the owner knows.
- `find`: one sentence on where the owner finds the value, such as
  `Data Factory Studio: Manage, Integration runtimes`. A new project's
  README.md shows it beside each `REPLACE_ME`.
- `suggest`: what the value could look like, with `<placeholders>` for the
  parts the owner fills in, such as `/Volumes/<catalog>/<schema>/<volume>`.
  It agrees with `find`. The editor shows it beside a `REPLACE_ME`; unlike
  `default`, `ingestron init` never writes it.

A method's settings schema MAY carry `find` too, on any property, as an
annotation that validation ignores, for the settings that belong in the
platform or the standard. A tool that has no `find` for a value says where
else to look, such as the connector's documentation.

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
