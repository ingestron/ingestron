# 04: Check in continuous integration

Generated files are usually committed. A CI job generates the wanted files
again and checks `plan.upToDate`; when it is false, someone changed the
definitions without regenerating. The job fails and lists the stale files.
Nothing is written.

## Expected output

```text
up to date
stale: orders.job.yml, shop.job.yml
```
