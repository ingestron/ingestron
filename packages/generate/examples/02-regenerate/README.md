# 02: Regenerate

The second run wants one file changed and one file no longer. Because neither
was edited by hand since it was generated, the plan updates one and deletes
the other. Changes are listed in path order. `diffs: true` shows the line diff under each update.

## Expected output

```text
delete    resources/legacy.job.yml
update    resources/orders.job.yml
          @@ -1,3 +1,3 @@
           name: orders
          -max_retries: 1
          +max_retries: 3
           timeout: 3600

3 files: 1 update, 1 delete, 1 unchanged. Ready to apply.
```
