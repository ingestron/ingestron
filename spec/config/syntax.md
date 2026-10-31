# Definitions syntax: specification

Version: 1 (draft). Status: implemented by `@ingestron/config` (TypeScript).
A Python implementation must pass the same [conformance cases](conformance/).

This document is written for people **implementing** the syntax. People
**using** it should start with the package
[tutorial](../../packages/config/docs/tutorial.md).

The key words MUST, MUST NOT and MAY are used as in RFC 2119.

## 1. Files

- A project is a set of UTF-8 text files addressed by paths relative to the
  project root, separated by `/`.
- A path MUST NOT leave the project root. Absolute paths, paths with a scheme
  (`https:`, `C:`) and paths containing `\` are refused (`PATH_OUTSIDE_PROJECT`).
- A file larger than `maxFileBytes` (default 10 MiB) is refused (`FILE_TOO_LARGE`).
- YAML files are those ending in `.yaml` or `.yml`. Each YAML file holds exactly
  one YAML document. Mapping keys MUST be scalars and are compared as text, so
  `1` and `'1'` are the same key; a duplicate key is an error (`YAML_SYNTAX`). Keys MUST NOT be
  `__proto__`, `constructor` or `prototype` (`UNSAFE_KEY`). Keys are never
  interpolated.
- YAML aliases MAY be used. Alias expansions per load are limited by
  `maxAliases` (default 100, `ALIAS_LIMIT`).

## 2. Manifest

The manifest (default `project.yaml`) is a YAML file with this shape:

```yaml
id: sales # required; matches ^[A-Za-z][A-Za-z0-9_-]*$
name: Sales data # optional
values: # optional mapping
  catalog: dev
environments: # optional; each name matches the id pattern
  prod:
    values: # optional mapping, deep-merged over `values`
      catalog: prod
imports: # required; one or more glob patterns
  - pipelines/*.pipeline.yaml
```

- `id`, `name` and `imports` are read literally; `${…}` in them is not resolved.
- `values` and each environment's `values` MUST be mappings written in the
  manifest; the values inside them MAY use references (including `${file:…}`).
- `values` and each environment's `values` are resolved as in section 4, but
  they MUST NOT refer to `values` (`VALUES_SELF_REFERENCE`).
- The selected environment's `values` are deep-merged over the top-level
  `values`: mappings merge key by key, and any other value replaces the
  earlier one. Selecting an environment that is not declared is an error
  (`UNKNOWN_ENVIRONMENT`).
- Import patterns are relative to the manifest's folder. `*` matches any
  characters except `/`, `**` matches any number of folders, and `?` matches
  one character except `/`. A pattern that matches no file is a warning
  (`NO_MATCH`). The manifest itself is never imported. Documents are processed
  in path order.

## 3. Documents

Each imported file is one document. After resolution (section 4) its root MUST
be a mapping with string fields `apiVersion`, `kind` and `id`
(`MISSING_HEADER`). The pair `apiVersion` + `kind` MUST name a kind the
caller registered (`UNKNOWN_KIND`). Two documents of the same kind MUST NOT
share an `id` (`DUPLICATE_ID`).

The resolved document is validated against the kind's JSON Schema
(draft 2020-12, unless the schema's `$schema` declares draft-07 or 2019-09,
which MUST then be applied with that version's rules; any other declared
version is refused when the kind is registered; `format` is not checked). Each failure is reported as
`SCHEMA` at the location the failing value came from, even when that value
came from another file through `${file:…}`.

Schema problems are written for the person editing the file, in the words of
the YAML they wrote (section 3.1).

### 3.1 Schema problem messages

A value's **path** is written as in YAML: keys joined with `.`, list items as
`[index]` (`ingest.when[0].use`); a key that is not letters, digits, `_` or
`-` is written `["key"]`. At the root, the path is "The document".

| Failure                       | Message                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Wrong type, value empty       | `<path> is empty; it must be <expected>.`                                                                           |
| Wrong type                    | `<path> is <actual>; it must be <expected>.`                                                                        |
| Missing field                 | `<path> needs "<field>".`                                                                                           |
| Unknown field                 | `"<field>" is not a field of <path>.`, then ` Did you mean "<field>"?` when a known field is at most two edits away |
| Not an allowed value          | `<path> is <value>; use one of: <values>.`                                                                          |
| Not the fixed value           | `<path> must be <value>.`                                                                                           |
| Pattern                       | `<path> <value> is not in the expected form.`                                                                       |
| Too short, too few, too small | `<path> must have at least <n> characters` (or `items`, `fields`); `<path> must be at least <n>` (or `at most`)     |
| Anything else                 | `<path> <validator message>.`                                                                                       |

`<expected>` is `a mapping` (object), `a list` (array), `text` (string),
`a number`, `a whole number` (integer), `true or false` (boolean), joined with
`or` when several are allowed. `<actual>` is `a mapping`, `a list`, or the value
itself in JSON. Values and lists of values are written in JSON, except that
allowed values that are strings are written without quotes.

Each problem has a **hint** when the schema says more: for a missing field,
that field's `description`; for an unknown field, `Fields: <names>.` listing
the fields allowed there; otherwise the failing value's `description`. When
the schema of that field has `examples`, the hint continues with
`For example:` and the first example as YAML under the field's name.

One mistake gives one problem: a `minProperties` failure is not reported
where a required field is missing, and a failure of `oneOf`, `anyOf` or `if`
is not reported where another failure is at the same place or inside it;
failures inside one alternative of a `oneOf` or `anyOf` are never reported
on their own. Reported alone, a `oneOf` or `anyOf` failure reads `<path> does
not match any of the forms allowed here.`, with the hint `Give one of:
<fields>.` when each alternative requires a field, else `It may be
<expected>.` when each has a type. A document's schema problems are reported
in the order of their location in the file.

A kind MAY declare **links**: a map from a JSON Pointer pattern (where `*`
matches any key or index) to a target kind **name** (compared with `kind`
only, across `apiVersion`s). Each value found at a matching pointer MUST be a
string that is the `id` of a document of that kind (`BROKEN_LINK`). Pointers
that match nothing are ignored. A document that failed its schema still
counts as a link target, but its own links are not checked. A link to the `id`
of a document that could not be loaded (`MISSING_HEADER` or `UNKNOWN_KIND`,
with that `kind`, or with no `kind`) is not reported: that document's own
problem is. A link pattern that is not a JSON Pointer, or a
schema that is not valid JSON Schema, is a mistake by the caller and is refused
when the kind is registered, before any project is loaded.

## 4. Strings

Only YAML scalar **values** that are strings are interpolated. Keys, numbers,
booleans, nulls and the contents of non-YAML files are never interpolated.

### 4.1 Grammar

```
string     = { text | escape | reference }
escape     = "$${"                      ; produces the literal text "${"
reference  = "${" ws expression ws "}"
expression = path | resolver
path       = root 1*( "." segment )
root       = "values" | "environment" | "project"
segment    = 1*( ALPHA | DIGIT | "_" | "-" )
resolver   = name ":" argument
name       = "file" | "envvar" | "secret"
argument   = 1*( any character except "}" )   ; surrounding spaces are trimmed
text       = any character, where "$" is not followed by "{" and "$$" is not followed by "{"
```

The string is read left to right. At each position, `$${` is checked before
`${`. A `${` with no closing `}` is `UNCLOSED_REFERENCE`. A `${…}` whose
expression does not match the grammar is `UNKNOWN_REFERENCE`:
`"<snippet>" is not a reference.`, then ` Did you mean "<reference>"?` when
replacing its root or resolver name with one at most two edits away makes it
match. Its hint lists the forms a reference takes, then tells the user to
write `$${` to keep the text as written.

When the expression starts with `{` (as in `${{ x }}`), the reported snippet
extends to the first `}}`, so that the hint shows the whole placeholder.

### 4.2 Whole value and embedded

- If the string is exactly one reference, the result is the referenced value
  with its own type (mapping, list, number, …).
- Otherwise the result is a string. Each referenced value MUST be a string,
  a finite number or a boolean (`NOT_TEXT`); numbers and booleans are written
  as JSON writes them (`0.5`, `8`, `true`). Lists, mappings, null, infinity and
  not-a-number cannot be embedded. A secret MUST NOT be embedded
  (`SECRET_IN_TEXT`).

### 4.3 Paths

- `values.a.b` reads the merged values. `environment.name` is the selected
  environment's name; with no environment selected it is `NO_ENVIRONMENT`.
  `project.id` and `project.name` read the manifest.
- Each segment selects a mapping key or a list index. A missing step is
  `UNKNOWN_VALUE`, and its hint SHOULD list the keys available at that step.

### 4.4 Resolvers

- `file:path#pointer`: path is relative to the file containing the reference.
  For a YAML file the value at the JSON Pointer (default: the whole document)
  is resolved recursively with the same rules (`BAD_POINTER` if absent). Any
  other file is returned as text, and a pointer is then an error
  (`BAD_POINTER`). A file that does not exist is `MISSING_FILE`. A chain that
  revisits the same `path#pointer` is `INCLUDE_CYCLE`; a chain deeper than
  `maxIncludeDepth` (default 32) is `INCLUDE_TOO_DEEP`. Every `file:`
  reference followed counts towards `maxIncludes` per load (default 1000,
  repeats included); going over is `INCLUDE_LIMIT`.
- `envvar:NAME`: the host environment variable. NAME MUST match
  `^[A-Za-z_][A-Za-z0-9_]*$` (`BAD_ARGUMENT`). An unset or empty variable is
  `ENVVAR_MISSING`.
- `secret:reference`: produces the mapping `{"$secret": "<reference>"}`
  unchanged. It is never resolved by this layer.

## 5. Output guarantees

- A string without `${` is returned unchanged.
- `$${` always produces `${`. Nothing else is altered: `{{ }}`, `@{}`, `$( )`,
  `%{ }`, `$ref` and the like pass through as written.
- No unresolved reference survives into a successful result.

## 6. Diagnostics

Every diagnostic has a `code`, a `severity` (`error` or `warning`), a
`message`, an optional `hint`, and, when it can be attributed, a location
(`file`, `line`, `column`, starting at 1). A problem with a string points at
the start of that string's value, including problems with values embedded in
it. A schema problem points at where the failing value was written; for a
whole-value `${file:…}` that is inside the included file. An implementation MUST report every
problem it can find rather than stopping at the first. A load succeeds only
when there are no errors. The full list of codes, with examples, is in the
[diagnostics reference](../../packages/config/docs/reference/diagnostics.md).

### 6.1 Fixes

A diagnostic MAY have `fixes`: changes that each solve the problem, for an
editor to offer and a person to choose. A fix has a `title`, such as
`Change to "shop"`, and `edits`, applied together. An edit names a project
`file` and a JSON Pointer into its document, and either:

- `set`: the value to write there; an existing mapping or list is replaced
  on its key's line, in flow style. Missing mapping keys on the way are added;
  a pointer ending in `/-` adds an item to the end of a list, adding the list
  when it is missing.
- `rename`: a new name for the key the pointer ends at.
- `remove: true`: removes the key or list item the pointer ends at, with its
  value. A mapping or list the removal leaves empty is removed too, up to the
  document's top level. In block style the lines from the entry's first to its
  value's last go; in flow style the entry goes with one separating comma. A
  pointer that names nothing removes nothing.

Applying a fix changes only the text of the values and keys it edits: every
other character of the file, comments and layout included, stays as written.
A value written into a flow collection (`{ }` or `[ ]`) is written in flow
style; a key added to a block mapping is written in block style at that
mapping's indentation.

The loader gives these fixes:

| Problem                                     | Fixes                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Unknown field with a field two edits away   | `Rename to "<field>"`                                                             |
| Not an allowed value (at most eight values) | `Change to <value>` (the value in JSON), one per allowed value, the closest first |
| Missing field with a default or an example  | `Add "<field>"` with the `default`, else the first `examples` value               |
| Broken link with an id two edits away       | `Change to "<id>"`, the closest first                                             |

## 7. Conformance

Each file in [conformance/](conformance/) is one case:

```yaml
description: What the case shows
environment: prod # optional
envvars: { NAME: value } # optional
limits: { maxIncludes: 3 } # optional overrides of the default limits
kinds: # optional
  - apiVersion: example.dev/v1
    kind: Pipeline
    schema: {} # JSON Schema
    links: {} # optional
files: # the project, path → content
  project.yaml: |
    …
expect:
  documents: # on success: kind, id and resolved value, in path order
    - { kind: Pipeline, id: orders, value: {} }
  diagnostics: # on failure (or warnings): matched in order on the fields given
    - { code: UNKNOWN_REFERENCE, file: a.yaml, line: 3, column: 7 }
  fixed: # optional: each fix's title, and the files after applying it
    - diagnostic: 0
      title: Change to "shop"
      files: { a.yaml: "…" } # only the files the fix changes
```
