# Data product passports

When a project has data products (definitions specification section 8),
`plan`, `apply` and `check` also generate the output folder `<out>/products/`,
with its own manifest, beside the packs' output folders. It holds one folder
per environment, `<out>/products/<environment>/`, each with that environment's
passports ([output folders](outputs.md), section 2); it is planned, applied,
checked and retired like the packs' folders. A project without data products
has no such folder. CLI 1.x wrote `<out>/<environment>/products/`.

Each environment's folder holds `README.md`, a table of every product (its name linking to
its page, owners, status, and the first sentence of its purpose), and one page
per product, named from its id (definitions specification section 8): its
passport, written for someone who does not know the tools. Its sections, in order:

1. **Name and summary:** the product's name (else its id), a `Deprecated` or
   `Retired` notice when `deprecated` is true or `status` is `retired`, its
   purpose, usage and limitations, and its domain, type, version and status.
2. **Owners and support:** the owners, the rest of the team with their roles,
   and each support channel.
3. **What it provides here:** each output port with each table that builds it
   in this environment, by full name, and where it lives: Databricks, Synapse
   serverless SQL, DuckDB, landed files (with their location), or the pack's
   id. An output no table builds here says "Not built in this environment."
4. **Columns:** per output, each column's name, description, type, whether it
   is required or part of the key, and its classification. The type is the
   contract's logical type, such as `integer` or `timestamp`. That holds for
   every column, whether it comes from the contract or from the landed files.
   A column that has only a physical type shows that. A classification the
   standard's governance lists as sensitive is marked so, and a classified
   column says when the engine that keeps its table tags it: `, tagged in
Unity Catalog` on Databricks, `, tagged on <engine>` on any other. That is
   decided per table, from the model: the pack that keeps the table (section
   5's engine; a table that ends at the landed files has none) has `tags` on,
   as [Access](#access) reads a capability. A table another pack keeps makes
   no such claim, even when the standard also names `databricks@2`.
5. **Quality:** per output, each table that builds it here, under its full
   name in code (a table that ends at the landed files: `Landed files at` and
   their location), with what checks it, its checks, and a Cleansing list
   (below). An output no table builds here says "Not built in this
   environment."
6. **Freshness:** the contract's `slaProperties`, and the refresh schedule.
7. **Who may use it:** per output, each table that builds it here, with
   each role granted on it, its principal in this environment and whether it
   is granted, the grant mode, each masked column and each row filter
   ([Access](#access), below). When no table built here has access and no
   contract names a role, the section says `The contracts name no roles.`
   (left out when no output is built here), followed by a line for each
   output no table builds here: `` `<output>`: Not built in this
environment. ``
8. **Lineage:** a Mermaid flowchart from each source connection through the
   tables and transforms to each output, with the same line for each output
   no table builds here. When the outputs built here have no lineage, such as
   a table with no source connection and no inputs, the section says "There
   is no lineage to show." in place of the flowchart, followed by those
   lines. A product with no output built here says only "Not built in this
   environment."
9. **Governance:** the standard's governance rules the product meets; a
   product that broke one would have stopped generation.

## Quality

Section 5 is written from the model alone. What the engine does not apply is
each table's `notApplied` (definitions specification, section 11.7), which
lists exactly that table's `NOT_APPLIED` features, whether or not the Platform
accepts the warnings (definitions specification, "Accepted warnings"):
accepting a warning quiets it, and does not make the feature enforced. A rule
the platform has off is the contract's rule with `notEnforced`. The engine is the pack of the step
that keeps the table (its store, else its transform, else its ingest step).

**What checks it.** One sentence, the engine, when its checks run and where
their results appear:

- Databricks: `Checked by Databricks on each pipeline update. Results: …`,
  `the pipeline's event log, published as a table` when the standard, or any
  table Databricks keeps, keeps results (`quality.results`), else `the
pipeline's update details in Databricks`.
- DuckDB: ``Checked by DuckDB each time `run.sql` runs. Results: the run
prints each check's failing rows (in Azure, in the job's log)``, and for a
  table that keeps results ``, and keeps them in `<schema>._ingestron_checks`
in the run's database (in Azure, only for that run)``, where `<schema>` is
  the table's own.
- Synapse: ``Checked by Synapse serverless SQL: the view leaves out the rows
a `drop` check fails each time it is queried, and `checks.sql` counts every
check when it runs. Results: what `checks.sql` returns; nothing keeps
them.``
- Any other pack: `Checked by <pack id> when it builds the table.`
- A table in a layer whose `does` is `raw`, whatever the engine: its checks
  only count, so the sentence says so and never that rows are left out:
  ``Counted only by <engine words>: `<layer>` keeps raw rows, so no check
leaves a row out. Results: …``, the results as the engine's own sentence
  gives them. The engine words are `Databricks on each pipeline update`,
  ``DuckDB each time `run.sql` runs``, `` `checks.sql` when it runs`` on
  Synapse, and `<pack id> when it builds the table` for any other pack (which
  ends the sentence with no results).
- A table that ends at the landed files: `Nothing checks these rows: the
table ends at the landed files.`
- A table none of whose checks runs: `None of these checks runs here.`
- A table with no check says `No quality rules.` in place of the sentence and
  the list.

**Each check.** One line per row check, then per table check, then per rule
nothing checks, then what the engine does not keep:

- A row check: `` `<name>`: <the rule in words>; <what a failing row
does>. ``, the rule's words from its `rule`, the column in code (for
  example: email has a value; age is less than 150; country is one of GB or
  IE, or has no value), or its check as code when it has none. What a failing row does
  follows the action and the engine: `a row that fails is kept, and counted`
  (`warn`); `a row that fails is left out of the table` (`drop`; on Synapse,
  `… of the view, and checks.sql counts it`), followed by ``, and kept in
`<quarantine>` `` when the table has a quarantine its engine keeps, by the
  quarantine's full name (on DuckDB followed by `in the run's database (in
Azure, only for that run)`, as its results are); `a row that fails stops the update` (`fail`; on
  DuckDB `stops the run, and nothing is published`).
- A table check: `` `<name>`: <what it counts, compared>, counted <when>; if
it fails, <what happens>. ``, such as: the number of rows is more than 0,
  counted after each refresh; if it fails, the refresh job fails.
- In a layer whose `does` is `raw`, a check that runs is counted only: its
  line ends `counted only: <layer> keeps raw rows.` in place of what a failing
  row does.
- A check whose rule kind, action or table checks the engine does not apply
  (an item of the table's `notApplied` with that kind, action or
  `table-checks` as its feature; for a table check that counts values against
  a `pattern`, also `pattern`), and a rule an engine or the platform could check but does not
  here (the model's `notEnforced`, such as `CAPABILITY_OFF` for a count over
  all rows with checks off): `` `<name>`: <words>. Not enforced: <reason>. ``,
  the reason being the item's `reason`, without its closing full stop.
- A rule nobody could check as written, a text rule among them:
  `` `<name>`: <description> Not checked: <reason>. ``
- A quarantine or results the table asks for that its engine does not keep:
  ``Keeping the rows a `drop` check leaves out. Not enforced: <reason>.`` and
  `Keeping the checks' results. Not enforced: <reason>.`

**Cleansing.** `Cleansing:`, then a list: for each column with an operation
the engine applies, in the contract's order, `` `<column>`: `` and its
operations in words, in the order they are applied, joined by `; ` (`converted
from Europe/London to UTC`, `spaces at either end removed`, `empty text
becomes no value`, `` `UK` becomes `GB` ``, `lower case`, `` no value becomes
`active` ``); then ``One row for each `<key>`: the last by `<column>`.`` when
the table deduplicates; or `Nothing is cleansed.` when it does neither. Each
operation the engine does not apply is a line `<operation> is not applied:
<reason>.` instead, and a column whose time zone conversion is not applied (an
item of `notApplied` with that `column`) has its conversion left out and a
line `` `<column>`: time zone conversion is not applied: <reason>. ``; the
table's other columns keep theirs. Last, for a table with a timestamp column, `Its
timestamps are in <zone>.`, or `Its timestamps are not all in one time zone:
see each column above.`

## Access

Section 7 is written from the model alone: each table's `access`
(definitions specification, section 8.2), what the steps that judge it do not
apply, and whether the platform turns on each capability for their packs. It
never judges access again.

**The engines.** A table's access is applied by the engine that keeps it (the
pack of section 5, unless the table ends at the landed files) and, when a
serve step of another pack serves it, by that pack too, in that order. Each
engine is named as section 3 names where a table lives: `Databricks`,
`Synapse serverless SQL`, `DuckDB`, or the pack's id. For each engine, an item
(a role's grant, its `write`, the exact grant mode, a mask or a filter) is:

- **not enforced, with the pack's reason**, when that engine's step does not
  apply it: an item of the table's `notApplied` for the keeping engine, of the
  serve step's `notApplied` for the serving one, with the feature `grants`,
  `write`, `exact`, `masks` (and the mask's `column`) or `filters`. The reason
  is the item's, without its closing full stop. It is written whether or not
  the Platform accepts the warning (definitions specification, "Accepted
  warnings"): accepting a warning quiets it, and does not make the item
  enforced.
- **not enforced, because the platform has it off**, when the capability that
  turns it on (`grants` for a role, `write` and the grant mode, `masks`,
  `filters`) is off for the engine's pack: for `databricks`, the model's
  `platform.manage`; for any other pack, `manage` in its section of the model's
  `platform.sections`. The reason is `the platform has <words> off`, the words
  being `grants`, `column masks` or `row filters`.
- **not enforced, because the platform has tags off**, for a mask or a filter
  whose own capability is on but whose engine's pack has `tags` off, read the
  same way: the policies find columns by their tags, and nothing sets them
  (definitions specification, section 7.1). The reason is `the platform has
tags off, and masks find columns by their tags` for a mask, and `the
platform has tags off, and row filters find columns by their tags` for a
  filter.
- **enforced** otherwise.

The passport cannot tell an item that the engine's pack applies from one its
coverage says nothing about: the model records only what a pack does not
apply. An item that a pack's coverage leaves out, or says is applied
`elsewhere`, therefore reads as enforced when the pack's switch is on. Every
pack Ingestron ships covers each access item, so this happens only with a
pack that leaves an access item out of its coverage.

A role's `write` and the grant mode are judged only where its grant is
enforced: where the grant is not, they share its reason.

**Each table.** Per output, `### <output>`, then for each table that builds it
here `#### <table>`, the table by its full name in code (a table served from
the landed files: `Landed files at` and their location). An output no table
builds here says `Not built in this environment.` For each table:

- With no `access`: `No role is granted on this table.`, or, for a table that
  ends at the landed files with no serve step, `Nothing is granted: the table
ends at the landed files.`
- Its grants, when it has any: a table with the columns `Role`, `Principal in
<environment>`, `Access` (`read`, or `write`), `Purpose` and `Approvers`
  (the contract role's `description` and `firstLevelApprovers`; empty for a
  layer's role) and `Granted`, one row for each grant in the model's order.
  `Granted` has a sentence per engine, joined with a space: `Granted on
<engine>.`; `Not enforced on <engine>: <reason>.`; or, for a `write` role
  whose grant is enforced but whose `write` is not, `Read granted on <engine>,
write not enforced: <reason>.` A table with `access` but no grants says `No role is granted on
this table.` in its place.
- The grant mode, when the table has grants or `exact` is true, one line.
  With `exact` false: `Grant mode: additive: access given in other ways
stays.` With `exact` true: `Grant mode: exact.`, then, per engine, a
  sentence that says what the engine keeps where it is enforced, and `Not
enforced on <engine>: <reason>.` where it is not:
  - Databricks: `On Databricks, any other access granted directly on the
table is taken away, except the owner's, the run_as principal's and the
unmasked principals'; grants on its schema or catalog stay.`
  - Synapse serverless SQL: `On Synapse serverless SQL, any other access
granted directly on the table is taken away, except ownership and grants
made WITH GRANT OPTION; grants on its schema or database stay.`
  - Any other engine: `On <engine>, any other access granted directly on the
table is taken away, except what its pack's reference says it keeps.`
- `Masked columns:`, then a list, one line for each mask in the contract's
  order: ``- `<column>` (<classification>): <mask words>``, the words
  being `shown as no value` (`null`), `hashed` (`hash`), `redacted` (`redact`) or
  ``masked by `<function>` `` (a function, its name as written), then, per
  engine, `, on <engine>` where it is enforced, and `. Not enforced on
<engine>: <reason>` where it is not, then a full stop. Left out when the
  table has no mask.
- `Row filters:`, then a list in the same way, one line for each filter:
  `` - `<name>`: `<function>` decides which rows each reader sees, from
`<column>` `` and the engines as for a mask. Left out when the table has no
  filter.

The output folder conformance cases ([output folders](outputs.md), section 8)
show this section: `24-passport-accepted-not-enforced` for a mask whose
`NOT_APPLIED` the Platform accepts, and `25-passport-served-access` for a
table one engine keeps and another serves.

## Text

Text from the definitions is written as it is, except that in table cells a
`|` is escaped and line breaks become spaces. A passport built from a model
resolved for deploy ([output folders](outputs.md), section 1) writes a
deploy-time value's text, `${envvar:NAME}`, that stands alone as
`` `NAME` (supplied when deploying) ``. Standing alone, it has a space, the
start or the end of the text on each side, apart from brackets and the
punctuation `,`, `.`, `;` and `:`. A deploy-time value inside a longer word,
such as `https://${envvar:TEAMS_HOST}/teams`, writes that word with `<NAME>`
in place of each reference, as code unless it holds a backtick already, then
the names: `` `https://<TEAMS_HOST>/teams` (`TEAMS_HOST` supplied when deploying) ``,
with several names joined by `and`. The same definitions always give
the same files: nothing depends on the date, the time or the repository.
