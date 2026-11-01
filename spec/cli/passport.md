# Data product passports

When a project has data products (definitions specification section 8),
`plan`, `apply` and `check` also generate, for each environment, an output
folder `<out>/<environment>/products/` with its own manifest. It sits beside
the packs' output folders, or inside the one pack's folder when the standard
names one pack; either way it is planned, applied, checked and retired like
theirs. A project without data products has no such folder.

The folder holds `README.md`, a table of every product (its name linking to
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
   is required or part of the key, and its classification; a classification
   the standard's governance lists as sensitive is marked so, and a classified
   column says when Databricks tags it in Unity Catalog (the standard names
   `databricks@1` and the platform turns on `manage.tags`).
5. **Quality:** each row check and table check in words, with when it runs or
   why it does not.
6. **Freshness:** the contract's `slaProperties`, and the refresh schedule.
7. **Who may use it:** each contract role with its access, purpose and
   approvers, as declared; Ingestron does not grant access.
8. **Lineage:** a Mermaid flowchart from each source connection through the
   tables and transforms to each output.
9. **Governance:** the standard's governance rules the product meets; a
   product that broke one would have stopped generation.

Text from the definitions is written as it is, except that in table cells a
`|` is escaped and line breaks become spaces. The same definitions always give
the same files: nothing depends on the date, the time or the repository.
