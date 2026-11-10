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
   column says when Databricks tags it in Unity Catalog. That is decided per
   table: the table is stored by the Databricks pack and the platform turns on
   `manage.tags`. A table stored by another pack makes no such claim, even when
   the standard also names `databricks@2`.
5. **Quality:** per output, each table that builds it here, under its full
   name in code (a table that ends at the landed files: `Landed files at` and
   their location), with what checks it, its checks, and a Cleansing list
   (below). An output no table builds here says "Not built in this
   environment."
6. **Freshness:** the contract's `slaProperties`, and the refresh schedule.
7. **Who may use it:** each contract role with its access, purpose and
   approvers, as declared; Ingestron does not grant access. A line for each
   output no table builds here says "Not built in this environment."
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
  `table-checks` as its feature), and a rule an engine or the platform could check but does not
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
