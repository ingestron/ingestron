# 03: A file edited by hand

After generation, someone adds a line to `orders.job.yml`. The next plan sees
that the file no longer matches what was generated and marks it as a
conflict. Applying is refused, so the edit is never lost. Move the change
into the definitions, or delete the file to generate it again.

## Expected output

```text
conflict  orders.job.yml
          Changed by hand since it was generated. Move the change into the definitions, or delete the file to generate it again.

1 file: 1 conflict. Resolve the conflicts before applying.

applied: false
PLAN_HAS_CONFLICTS: The plan has conflicts or problems; resolve them and plan again.
```
