# 01: Resolve

Resolves the files of the [minimal conformance case](../../../../spec/definitions/conformance/01-minimal.yaml)
for `dev`, using the specification's test pack, and prints each table's full
name, the methods chosen for it and the columns from its data contract.
Nothing in the flow names a method, so both come from the pack's defaults.

## Expected output

```text
dev.bronze.orders: files → stream
  columns: id, total
pipeline retail, mode development
```
