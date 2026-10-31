# Standards and conventions

Acme's standard, shared by all its projects:

| Setting                                                        | Effect in [prod](build/prod/)                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `catalog: acme`, `schema: "{{ environment }}_{{ layer }}"`     | one catalog; schema `prod_raw`                                     |
| `table: "{% if source %}{{ source }}__{% endif %}{{ table }}"` | `ads__campaigns`, `web__visits`                                    |
| `pipeline: "{{ project }}_{{ environment }}"`                  | pipeline `marketing_prod`                                          |
| `layers: [raw, curated, published]`                            | flow tables land in `raw`                                          |
| `types: { number: DECIMAL(38,6) }`                             | `spend` hinted as `DECIMAL(38,6)`                                  |
| `ingest.settings.files.schema_evolution: rescue`               | `schemaEvolutionMode => 'rescue'`                                  |
| `store.settings`                                               | table properties on every streaming table                          |
| `store.allowed: [streaming-table]`                             | a flow naming another store method fails with `METHOD_NOT_ALLOWED` |
| `store.fixed: { cluster_by: auto }`                            | a flow setting `cluster_by` fails with `FIXED_SETTING`             |
