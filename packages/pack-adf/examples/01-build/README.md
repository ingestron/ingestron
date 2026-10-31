# 01: Build

Builds the ADF resources of [example 12](../../../../samples/starters/private-sql-server/)
for `prod` and lists them, without writing them: the shared Key Vault and
landing services first, then one SQL Server service, dataset, pipeline and
trigger for the `erp` database.

## Expected output

```text
linkedService/ls_erp_keyvault.json
linkedService/ls_erp_landing.json
dataset/ds_erp_landing.json
linkedService/ls_erp_erp_erp.json
dataset/ds_erp_erp_erp.json
pipeline/pl_erp_erp.json
trigger/tr_erp_erp.json
```
