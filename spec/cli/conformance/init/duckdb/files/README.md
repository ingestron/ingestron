# local

DuckDB on a laptop. Sample orders loaded into a local DuckDB database, a SQL transform over them, and both tables published as Parquet.
`ingestron init` wrote this file on 2026-11-04; it is yours, and Ingestron never rewrites it.
The table `orders` and the contracts `contracts/customer_totals.yaml`, `contracts/orders.yaml` are examples: rename the tables and change the contracts' columns to your source's.

## Run it

```sh
ingestron plan     # what would be generated, and what is still REPLACE_ME
ingestron apply    # writes the files under build/
```

## Values to replace before deploying

Nothing to replace: this project runs on this computer.

## Secrets to create

None: no connection here names a Key Vault secret.

## Deploy

### duckdb: `build/duckdb` (dev)

A folder for each environment. Build its tables on this computer:

```sh
duckdb -bail ingestron.duckdb -c ".read build/duckdb/<environment>/run.sql"
```

## Ask the platform team

`ingestron request --env dev > request-dev.md` writes what must exist before deploying, such as
the identities' access, as Markdown to send. It lists any value still `REPLACE_ME`.

## Values per environment

- `project.yaml`, `environments.<name>.values`: names, hosts and paths, reviewed in Git. Start here.
- `${envvar:NAME}`: a deploy-time value that the pipeline deploying `build/` supplies, such as
  `BUNDLE_VAR_<name>`; `ingestron request` names each per platform. `.env.<environment>` (kept
  out of Git) sets it on your computer for DuckDB.
- `${secret:NAME}`: a Key Vault secret's name, never its value.
