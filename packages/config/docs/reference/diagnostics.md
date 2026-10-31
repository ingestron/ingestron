# Diagnostics reference

Every code the loader reports, with an example and the fix. All are errors
except `NO_MATCH`, which is a warning. The loader reports every problem it can
find in one pass.

## Files and YAML

### `MISSING_FILE`

A file named in `${file:…}`, or the manifest, does not exist inside the project.

```yaml
query: ${file:orders.sql} # there is no orders.sql next to this file
```

Fix: correct the path. It is relative to the file containing the reference.

### `FILE_TOO_LARGE`

A file is larger than `limits.maxFileBytes` (default 10 MiB). Split it, or
raise the limit.

### `PATH_OUTSIDE_PROJECT`

A `${file:…}` path or an import pattern would leave the project folder.

```yaml
secrets: ${file:../../.env} # refused
other: ${file:/etc/hosts} # refused: absolute
remote: ${file:https://example.com/x.yaml} # refused: not a project path
```

Fix: move the file into the project.

### `YAML_SYNTAX`

The YAML cannot be read: bad indentation, a duplicate key, or more than one
document in a file. Keys are compared as text, so `1` and `'1'` are duplicates.

```yaml
id: a
id: b # Map keys must be unique
```

### `UNSAFE_KEY`

A key is `__proto__`, `constructor` or `prototype`, or is not plain text
(for example a mapping used as a key). Rename the key.

### `ALIAS_LIMIT`

More than `limits.maxAliases` (default 100) YAML alias expansions in one load.
This protects against a few lines expanding into gigabytes. Use fewer
aliases, or move shared parts into a file and use `${file:…}`.

## References

### `UNKNOWN_REFERENCE`

A `${…}` that is not one of ours. Usually a placeholder meant for a
generated file.

```yaml
job_name: orders_${bundle.target}
```

```text
orders.pipeline.yaml:4:11  error  UNKNOWN_REFERENCE
  "${bundle.target}" is not a reference.
  A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, ${file:<path>}, ${envvar:<name>} or ${secret:<name>}. To keep "${bundle.target}" as text, write "$${bundle.target}".
```

Fix: write `$${` to keep the text, or correct the reference
(`values`, `environment`, `project`, `file:`, `envvar:`, `secret:`).

### `UNCLOSED_REFERENCE`

A `${` without a closing `}`.

```yaml
note: "costs ${values.price"
```

Fix: add the `}`, or write `$${` if the text is literal.

### `UNKNOWN_VALUE`

The path does not exist. The hint lists the names that do.

```text
orders.pipeline.yaml:4:10  error  UNKNOWN_VALUE
  "${values.catalgo}" has no value: "catalgo" is not defined.
  Available here: catalog.
```

### `VALUES_SELF_REFERENCE`

A value in the manifest uses `${values.…}`. Values cannot refer to each other;
write the value out, or build the combined text in the document.

```yaml
values:
  catalog: main
  table: ${values.catalog}_orders # refused
```

### `NO_ENVIRONMENT`

`${environment.name}` was used, but no environment was selected. Pass
`environment` in the load options.

### `UNKNOWN_ENVIRONMENT`

The selected environment is not declared under `environments:` in the
manifest. The hint lists the declared ones.

### `ENVVAR_MISSING`

`${envvar:NAME}` names a variable that is unset or empty on the machine that
loads the project. Set it, or pass `envvars` in the load options.

### `BAD_ARGUMENT`

A resolver's argument is malformed, such as `${envvar:1BAD}`. Environment
variable names use letters, digits and `_`, and do not start with a digit.

### `BAD_POINTER`

The `#…` part of `${file:…}` is wrong: it does not start with `/`, finds no
value, or is used on a file that is not YAML.

```yaml
columns: ${file:shared.yaml#/missing} # no "missing" key in shared.yaml
query: ${file:orders.sql#/x} # pointers only apply to YAML
```

### `INCLUDE_CYCLE`

Files include each other in a loop. The message shows the chain:

```text
two.yaml:1:7  error  INCLUDE_CYCLE
  "${file:one.yaml}" leads back to itself: a.yaml# → one.yaml# → two.yaml# → one.yaml#.
```

### `INCLUDE_TOO_DEEP`

More than `limits.maxIncludeDepth` (default 32) includes inside one another.

### `INCLUDE_LIMIT`

More than `limits.maxIncludes` (default 1000) `${file:…}` references were
followed in one load, counting repeats. This stops a few small files that each
include the next several times from expanding without bound. Include shared
files fewer times, or raise the limit.

### `NOT_TEXT`

A value that cannot be written as text is embedded in text: a list, a
mapping, null, or a number that is infinite or not a number (`.inf`, `.nan`).

```yaml
label: "columns: ${file:columns.yaml}" # columns.yaml holds a list
```

Fix: use it as a whole value, or refer to one item.

### `SECRET_IN_TEXT`

A secret is embedded in text, which would put it into logs and generated files:

```yaml
url: "jdbc://user:${secret:scope/pw}@host"
```

Fix: use the secret as a whole value, and let the tool that uses the
definitions build the connection string at run time.

## Documents

### `MISSING_HEADER`

A document lacks a text `apiVersion`, `kind` or `id`, or is empty.

### `UNKNOWN_KIND`

No kind with this `apiVersion` and `kind` was passed to the loader. The hint
lists the registered kinds. Fix the document, or add the kind to `kinds`.

### `DUPLICATE_ID`

Two documents of the same kind have the same `id`. The message names the
earlier file.

### `SCHEMA`

The resolved document does not match its kind's schema. The location is where
the failing value was written, even when it came from another file through
`${file:…}`.

```text
columns.yaml:3:13  error  SCHEMA
  columns[1].nullable is "yes"; it must be true or false.
```

Fields are named as written in YAML (`columns[1].nullable`), and the message
says what is wrong in words: a field that is empty or of the wrong type, a
missing field, an unknown field (with the nearest known field when there is
one), or a value that is not allowed (with the allowed ones). The hint gives
the field's `description` and, when the schema has `examples`, an example of
what to write. Write descriptions and examples in your kinds' schemas: they
are what your users see when something is wrong. One mistake gives one
problem, and a document's problems come in the order of the file.

### `BROKEN_LINK`

A field declared in the kind's `links` does not hold the id of a document of
the target kind. The hint lists the ids that exist. A document that fails its
schema still counts as existing, so you see its `SCHEMA` error, not a broken
link as well. The same holds for a document that could not be loaded at all
(`MISSING_HEADER`, `UNKNOWN_KIND`): a link to its id is not reported again.

```text
orders.yaml:6:12  error  BROKEN_LINK
  "customers" is not the id of a Pipeline document.
  Known Pipeline ids: orders.
```

## Imports

### `NO_MATCH` (warning)

An import pattern matched no files. The load still succeeds; check the
pattern, which is relative to the manifest's folder.
