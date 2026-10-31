# Layers and transforms

- Two flow tables land in **bronze** (the first layer).
- `store_sales` joins them in **silver** (a transform's default layer):
  [a materialised view](build/dev/src/sales/silver/store_sales.sql) over
  `transforms/store_sales.sql`, where `{{ tables.sales }}` became
  `` `dev`.`bronze`.`sales` ``.
- `region_sales` reads `store_sales` and says `layer: gold`.
  The standard's rule for `layer: gold` turns clustering off and adds a
  retention property: compare [gold](build/dev/src/sales/gold/region_sales.sql)
  with silver.

Transforms are ordered by their inputs, not by file name, and one pipeline
builds all four tables.
