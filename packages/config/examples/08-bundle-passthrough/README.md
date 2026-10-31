# 08: Bundle passthrough

Definitions that generate a Databricks bundle, where both have their own
`${…}` syntax.

Two kinds of value meet here:

| Written in the definition     | Resolved by    | When        | In the generated bundle |
| ----------------------------- | -------------- | ----------- | ----------------------- |
| `${values.catalog}`           | this package   | load time   | `main`                  |
| `$${bundle.target}`           | the bundle CLI | deploy time | `${bundle.target}`      |
| `{{job.start_time.iso_date}}` | Databricks     | run time    | unchanged               |

What to notice:

- Only text starting with `${` is ours. To keep a `${…}` for the output,
  write `$${…}`. Forgetting the extra `$` is an error with the fix in the
  hint (see example 06), never a silent change.
- Text that does not start with `${` (`{{ }}`, `@{}`, `$(…)`, `$ref`) needs
  no escaping.
- The generator builds the bundle as data and serialises it with a YAML
  library. Values are never pasted into YAML text, so whatever a value
  contains is written exactly.
- Keep definitions apart from the bundle: their own folder and file suffix,
  so the bundle's `include:` globs never pick them up.

## Expected output

```text
resources:
  jobs:
    orders:
      name: orders_${bundle.target}
      tasks:
        - task_key: load
          existing_cluster_id: ${var.cluster_id}
          notebook_task:
            notebook_path: ../notebooks/load.py
            base_parameters:
              table: main.sales.orders
              run_date: "{{job.start_time.iso_date}}"
```
