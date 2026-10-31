# 03: Environments

One set of definitions, different values per environment.

What to notice:

- `values` in `project.yaml` are the defaults. Each environment can override
  them under `environments.<name>.values`.
- Mappings merge key by key: prod changes `cluster.workers` but keeps
  `cluster.node_type` from the defaults. Anything else (text, numbers, lists)
  is replaced.
- `${environment.name}` is the selected environment's name.
- `${values.cluster}` as a whole value inserts the mapping, not text.
- Values cannot refer to other values. This keeps them easy to read: every
  value is written out where it is defined.

## Expected output

```text
dev: dev_catalog.raw_dev_orders, 2 x small
prod: prod_catalog.raw_prod_orders, 8 x small
```
