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
5. **Quality:** each row check and table check in words, with when it runs or
   why it does not. An output no table builds here says "Not built in this
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

Text from the definitions is written as it is, except that in table cells a
`|` is escaped and line breaks become spaces. A passport built from a model
resolved for deploy ([output folders](outputs.md), section 1) writes each
deploy-time value's text, `${envvar:NAME}`, as `` `NAME` (supplied when deploying) ``. The same definitions always give
the same files: nothing depends on the date, the time or the repository.
