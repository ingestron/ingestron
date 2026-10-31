# Explanation: why it works this way

Background for the design choices. Nothing here is needed to use the package.

## Why `${…}`, and why `$${` to escape

Definitions are usually turned into other files: Databricks bundles, SQL,
pipeline JSON, CI workflows. Those files have their own placeholders, and
almost every common style is already taken by one of them:

| Style    | Used by                                         |
| -------- | ----------------------------------------------- |
| `${…}`   | Databricks bundles, Spark SQL, Bicep, Terraform |
| `{{ }}`  | Jinja, dbt, Databricks SQL parameters           |
| `@{…}`   | Azure Data Factory expressions                  |
| `${{ }}` | GitHub Actions, Azure Pipelines                 |
| `$ref`   | JSON Schema, OpenAPI                            |

No new symbol could avoid all of them. So the package uses one familiar
form, `${…}`, and makes the overlap safe in three ways:

1. **Only `${` is ours.** Everything else in the table passes through with no
   escaping.
2. **`$${` always means a literal `${`.** This is the convention Docker Compose
   and Terraform use, so many people already know it.
3. **A `${…}` we do not recognise is an error, not a pass-through.** If you
   forget the escape, you get an error with the escaped form in the hint.
   Output text is never changed silently.

Our reference names (`values`, `environment`, `project`) are different from a
bundle's (`var`, `bundle`, `workspace`, `resources`), so a reader can always
tell whose placeholder they are looking at.

## Why not YAML tags such as `!include`

Tags avoid escaping entirely, but they work badly with the standard VS Code
YAML extension. It flags unknown tags unless every workspace configures them,
and JSON Schema cannot describe tags, so validation while typing would be
weaker. `${…}` strings work with the standard extension, using the same
technique Databricks uses for its bundle schema (see `toEditorSchema`).

## Load time and deploy time

There are two moments when placeholders are filled in:

- **Load time**: this package resolves `${values.catalog}` when the
  definitions are read. The result is fixed in whatever is generated.
- **Deploy or run time**: the target tool resolves `${bundle.target}` or
  `{{ run_date }}` later, possibly differently each time.

The `$${` escape is how a definition says "this one is for later". The
manifest uses the name `environments`, never `targets` or `variables`, so
that the two layers cannot be confused.

## Why values cannot refer to other values

Allowing `table: ${values.catalog}_orders` inside `values` means values must be
resolved in dependency order, with cycle detection, and a reader has to
follow chains to see what a value is. Keeping values flat means each value is
written out where it is defined. Combine values in the documents that use
them, where `${…}` works freely.

## Why code is kept in files and never interpolated

SQL, Python and notebook code are full of `${…}` and `{{ }}` meant for other
tools. Rather than skipping fields by name (`sql`, `query`, …), which hides
rules from the reader, there is one visible rule: the contents of a non-YAML
file inserted with `${file:…}` are never interpolated.

## Why every error has a file and line, even through includes

As the loader walks each document, it records where every value was written,
including values that came from other files. When the schema check fails at
`/columns/1/nullable`, the loader looks that pointer up and reports
`columns.yaml:3:13`, the line you need to edit, rather than the line of the
`${file:…}` reference.

## Why the safety limits exist

Definitions can come from pull requests by many people. The limits on file
size (checked before a file is read), include depth, total includes and YAML
alias expansion stop a mistaken or hostile file
from exhausting memory. Paths are fenced to the project folder, including
through symbolic links, so a definition cannot read files it does not own.
Secrets are never read at load time, only passed on as references.

## Why a specification and conformance cases

A Python implementation is planned, for use with PySpark. The
[specification](../../../spec/config/syntax.md) and its
[conformance cases](../../../spec/config/conformance/) define the behaviour
independently of TypeScript. Both implementations must pass the same cases,
which also serve as exact examples of input and output.
