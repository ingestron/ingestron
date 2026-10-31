# Syntax reference

Every rule, with an example of each. The normative version, for implementers,
is the [specification](../../../../spec/config/syntax.md). Each rule also has a
[conformance case](../../../../spec/config/conformance/) that shows exact
input and output.

## Files

| Rule                                                            | Example / note                             |
| --------------------------------------------------------------- | ------------------------------------------ |
| Paths are relative to the project root and use `/`              | `pipelines/orders.pipeline.yaml`           |
| `.yaml` and `.yml` files are YAML; anything else is text        | `${file:orders.sql}` gives the file's text |
| One YAML document per file                                      | A second `---` is a `YAML_SYNTAX` error    |
| Duplicate keys are errors; keys are compared as text            | `1` and `'1'` clash: `YAML_SYNTAX`         |
| Keys are never interpolated                                     | `${x}: 1` is the key `${x}`                |
| `__proto__`, `constructor`, `prototype` are not allowed as keys | `UNSAFE_KEY`                               |
| YAML anchors and aliases work, up to 100 expansions per load    | `ALIAS_LIMIT`                              |

## Manifest (`project.yaml`)

```yaml
id: sales # required, letters, digits, _ and -; starts with a letter
name: Sales data # optional
values: # optional; defaults for every environment
  catalog: dev_catalog
  cluster: { workers: 2, node_type: small }
environments: # optional
  dev: {}
  prod:
    values: # merged over the top-level values
      catalog: prod_catalog
      cluster: { workers: 8 } # node_type stays "small"
imports: # required; glob patterns relative to this file's folder
  - "pipelines/*.pipeline.yaml"
  - "connections/**/*.yaml"
```

- `id`, `name` and `imports` are read literally.
- `values` must be a mapping written in the manifest; the values inside it may
  use references, for example `columns: ${file:shared/columns.yaml}`.
- Values may use `${environment.…}`, `${project.…}`, `${file:…}`,
  `${envvar:…}` and `${secret:…}`, but not `${values.…}`.
- Merging: mappings merge key by key; text, numbers and lists replace.
- Globs: `*` is any characters except `/`, `**` is any number of folders,
  `?` is one character. A pattern that matches nothing is a `NO_MATCH` warning.

## Documents

```yaml
apiVersion: example.dev/v1 # with kind, must match a registered kind
kind: Pipeline
id: orders # unique among documents of the same kind
# … any other fields, checked by the kind's schema after resolution
```

## References

| Form                  | Result                                          | Example                                |
| --------------------- | ----------------------------------------------- | -------------------------------------- |
| `${values.a.b}`       | The value at `a.b`, after the environment merge | `${values.cluster.workers}` → `8`      |
| `${values.list.0}`    | A list item, by index from 0                    | `${values.hosts.0}`                    |
| `${environment.name}` | The selected environment's name                 | `raw_${environment.name}` → `raw_prod` |
| `${project.id}`       | The manifest's id                               | `${project.id}` → `sales`              |
| `${project.name}`     | The manifest's name                             |                                        |

Spaces inside the braces are allowed: `${ values.catalog }`.

A diagnostic about a string points at the start of the string's value, even
when the problem is a reference in the middle of it.

## Resolvers

| Form                 | Result                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `${file:path}`       | The whole of another file: YAML is parsed and resolved; any other file is its exact text  |
| `${file:path#/a/0}`  | The value at a JSON Pointer inside a YAML file (`~1` is `/`, `~0` is `~` in pointer keys) |
| `${envvar:NAME}`     | An environment variable; unset or empty is `ENVVAR_MISSING`                               |
| `${secret:anything}` | `{ "$secret": "anything" }`, never resolved                                               |

`file:` paths are relative to the file that contains the reference and cannot
leave the project folder. A file that includes itself, directly or through
others, is an `INCLUDE_CYCLE`.

## Whole value or embedded

```yaml
workers: ${values.workers} # whole value: the number 8
cluster: ${values.cluster} # whole value: the mapping { workers: 8, … }
label: workers-${values.workers} # embedded: the text "workers-8"
```

Embedded references must produce text, a finite number or a boolean. Lists,
mappings, null (`NOT_TEXT`) and secrets (`SECRET_IN_TEXT`) can only be whole
values.

## Links between documents

A kind's `links` names fields that hold another document's `id`. The target
is matched by `kind` name only, so a link to `Connection` accepts a Connection
of any `apiVersion`.

## Escaping

| Write           | Get       | Use for                                      |
| --------------- | --------- | -------------------------------------------- |
| `$${`           | `${`      | Placeholders that belong to a generated file |
| `$$${`          | `$${`     | The rare case of a literal `$${`             |
| `$`, `$$`, `{{` | unchanged | Nothing to escape unless followed by `{`     |

Any `${…}` that is not one of the forms above is an `UNKNOWN_REFERENCE` error
whose hint shows the escaped form.
