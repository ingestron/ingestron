# 06: Errors

What mistakes look like. This project contains four on purpose:

| File                      | Mistake                                     | Code                |
| ------------------------- | ------------------------------------------- | ------------------- |
| `orders.pipeline.yaml`    | `${values.catalgo}` is a typo               | `UNKNOWN_VALUE`     |
| `orders.pipeline.yaml`    | `${bundle.target}` was meant for the bundle | `UNKNOWN_REFERENCE` |
| `orders.pipeline.yaml`    | `orders.sql` does not exist                 | `MISSING_FILE`      |
| `customers.pipeline.yaml` | `workers` must be a number                  | `SCHEMA`            |

What to notice:

- The loader does not stop at the first problem.
- Each diagnostic has a location (`file:line:column`), a code you can look up
  in [the diagnostics reference](../../docs/reference/diagnostics.md), and
  usually a hint with the fix.
- `${bundle.target}` is not silently passed on. The hint gives the escape
  (`$${bundle.target}`) to use when the text is meant for the output.

This example exits normally so its output can be compared; a real tool would
exit with a non-zero code when `result.ok` is false.

## Expected output

```text
ok: false
customers.pipeline.yaml:5:10  error  SCHEMA
  workers is "four"; it must be a whole number.
orders.pipeline.yaml:4:10  error  UNKNOWN_VALUE
  "${values.catalgo}" has no value: "catalgo" is not defined.
  Available here: catalog.
orders.pipeline.yaml:5:11  error  UNKNOWN_REFERENCE
  "${bundle.target}" is not a reference.
  A reference is ${values.<name>}, ${environment.<name>}, ${project.<name>}, ${file:<path>}, ${envvar:<name>} or ${secret:<name>}. To keep "${bundle.target}" as text, write "$${bundle.target}".
orders.pipeline.yaml:6:8  error  MISSING_FILE
  File not found inside the project: orders.sql.
  Check the path. It is relative to the file that mentions it.
```
