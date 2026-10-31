# 05: Cross-references

Documents that name other documents by id.

What to notice:

- `links` in `defineKind` lists the fields that hold another document's id,
  as JSON Pointers. `*` matches every key or list item.
- The loader checks every link. A typo such as `source: epr` fails the load
  with `BROKEN_LINK`, pointing at the exact line, and lists the ids that do
  exist.
- After a successful load, `project.get(kind, id)` follows a link safely.

## Expected output

```text
customers reads from erp.internal.example
orders reads from erp.internal.example, after customers
```
