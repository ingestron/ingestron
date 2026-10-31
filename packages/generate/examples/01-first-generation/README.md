# 01: First generation

Plans the wanted files against an empty folder, prints the plan, and applies
it. Applying also writes `.generated.json`, the manifest that records what was
generated, so the next run can tell generated files from yours.

## Expected output

```text
create    databricks.yml
create    resources/orders.job.yml

2 files: 2 create. Ready to apply.

applied: true
folder: .generated.json, databricks.yml, resources
```
