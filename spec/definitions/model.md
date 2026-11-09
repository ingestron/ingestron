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
- a Connection's `connector` and `connectivity`;
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
- a Platform's `naming` and `mode`;
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
`chosenBy` and the model's `deployValues`. Tables are matched by name. It
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
  access:
    sensitive: { require: [description, firstLevelApprovers] } # also access
```

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

## 9. Conformance

Each case in [conformance/](conformance/) gives `files` (the project), an
optional `environment`, optional `envvars` and `missingEnvvars` (as in the
config conformance cases), an optional `deployTime: true` (section 1.1), an
optional `environmentsTogether: true` (section 7), an optional
`replaceMe: error` (section 1), and
`expect`: `tables` (partial objects, in order,
with `fullName` written as `catalog.schema.table`, and `null` for a step the
table does not have, such as `serve: null`), `products` (partial objects,
in order), `platform`, `names`, `deployValues` (the model's, exactly) or
`diagnostics` (matched in order on the fields given; `fixes` lists the fix
titles, and `fixes: []` means the diagnostic has none), and optionally
`fixed`, as in the config conformance cases. All cases use the
data-only packs [conformance/pack.yaml](conformance/pack.yaml),
[conformance/pack-bridge.yaml](conformance/pack-bridge.yaml),
[conformance/pack-local.yaml](conformance/pack-local.yaml),
[conformance/pack-fold.yaml](conformance/pack-fold.yaml),
[conformance/pack-checked.yaml](conformance/pack-checked.yaml),
[conformance/pack-plain.yaml](conformance/pack-plain.yaml) and
[conformance/pack-three.yaml](conformance/pack-three.yaml), all available. A
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
an earlier one has is left out. A list's `items` schema is never an entry of
its own. A `$ref` already being followed further up is not followed again, so
a schema that contains itself, such as a column with nested columns, is
described once.

**What an entry has.**

- `path`: the keys from the root, with `*` for any key of a mapping or any
  list item; `name` is the last key.
- `required`: the name is in the `required` of the parent schema or of the
  items of its `allOf`, at any depth of `allOf`. A `*` entry is not required.
- `description`, `default`, `minimum`, `maximum` and the example (the first of
  `examples`): from the field's schema, else from the first of its branches
  that gives it. Only the inclusive `minimum` and `maximum` are carried, not
  `exclusiveMinimum` or `exclusiveMaximum`.
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
existed. Section 11.1 defines the words and section 11.2 how a value is
resolved for each table. Which pack uses which is in each pack's own
specification.

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
`retention` and `quality` (its `required` and `default`, as in the standard's
`quality`). An object without a `name` is a load error at the item.

**Standard.** Beside `layers`, the standard may give:

| Field                                      | Meaning                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features`                                 | `ga` or `preview`: whether platform features in preview may be used.                                                                                                                                                                                                   |
| `origin`                                   | `{ standard, version }`: the published standard this one was made from.                                                                                                                                                                                                |
| `load`                                     | `default` (a load mode), `deletes` (a delete mode) and `when`, a list of rules, each with some of the facts `connectivity`, `connector`, `input` and `layer`, and `use`, a load mode. Rules are checked in order: the first whose facts all match chooses `load.mode`. |
| `audit`, `rescued`, `retention`, `storage` | The same as a layer's or a table's, for every table.                                                                                                                                                                                                                   |
| `quality.results`                          | `true`: keep the results of checks as a table.                                                                                                                                                                                                                         |
| `operations`                               | Policy for runs, below.                                                                                                                                                                                                                                                |
| `fixed`                                    | Intent that no layer, flow or transform may change: any of `load`, `history`, `sequence`, `audit`, `rescued`, `retention`, `storage` and `operations`, in the forms below. It is separate from each action's `fixed` settings.                                         |

**Flows and transforms.** A flow and a flow table may give `load`, `history`,
`sequence` and `audit`; a transform may give `history`, `sequence` and
`audit`.

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
`^[a-z_][a-z0-9_]*$`.

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

| Field          | Meaning                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `schedule`     | `{ per }`: `project` for one schedule, `flow` for one per flow.                                                |
| `trigger`      | `schedule`, `files`, `upstream` or `continuous`.                                                               |
| `retries`      | `{ count, interval }`: tries again and the wait between them.                                                  |
| `timeout`      | How long a run may take before it is stopped.                                                                  |
| `alerts`       | `{ on, slow_after }`: `on` lists `failure` and `slow`; `slow_after` is the duration after which a run is slow. |
| `concurrency`  | `{ max_runs, queue }`: the most active runs, and whether one over the limit waits instead of being skipped.    |
| `require_tags` | Tags the platform must give a value for.                                                                       |

A **duration** is a whole number and a unit, `s`, `m`, `h` or `d`, matching
`^[0-9]+(s|m|h|d)$`, such as `30d`.

**Paths.** Every intent path and its values are listed in the implementation
as `intentPaths`, for coverage maps: `load.mode`, `load.cursor`,
`load.deletes.mode`, `load.deletes.when`, `history`, `sequence`, `audit`,
`rescued`, `retention.time_travel`, `retention.log`, `retention.landed_files`,
`storage.clustering`, `storage.features`, `operations.trigger`,
`operations.retries`, `operations.timeout`, `operations.alerts`,
`operations.concurrency` and `quality.results`. A value of `*` stands for any
text.

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
what these layers left unset; they are not part of declared intent. A
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
section 11.1 (`{}` when nothing is declared), and `intentOrigins`, for each
intent path that has a value, the layer that last set it (`standard`, `layer`,
`rule`, `definition`, `table` or `fixed`) with the `file` and `line` where it
was written. The paths are those of `intentPaths`: `load.mode`, `load.cursor`,
`load.deletes.mode`, `load.deletes.when`, `history`, `sequence`, `audit`,
`rescued`, `retention.time_travel`, `retention.log`, `retention.landed_files`,
`storage.clustering` and `storage.features`; a list has one origin, under its
path. The origin's layer name `layer` is used only for intent. Comparing
targets (section 2.1) leaves `intentOrigins` out, as it leaves out `origins`.

## Connector authoring metadata

A connector's settings metadata may mark a field `optional`, give its primitive
`type` (`text`, `number`, or `object`), and list allowed text `values`. Absence of
`optional` means required for the connector's default authentication path;
conditional fields explain the condition in their description. Snippets include
only that default path's required fields. This metadata describes authoring;
the selected method still validates the resolved definition.

Two more fields serve project creation, both optional:

- `default`: a value `ingestron init` writes for the setting, a number, `true`
  or `false`, or one of its `values`. It is a choice that suits most projects,
  not a stand-in for a value only the owner knows.
- `find`: one sentence on where the owner finds the value, such as
  `Data Factory Studio: Manage, Integration runtimes`. A new project's
  README.md shows it beside each `REPLACE_ME`.

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
