// The ADF files generated for the two private starters, kept as a snapshot so
// any change to them is reviewed.
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";
import { expect, it } from "vitest";
import { adf } from "@ingestron/pack-adf";
it.each(["private-sql-server", "private-files"])(
  "keeps the ADF files generated for %s",
  (sample) => {
    const root = join(import.meta.dirname, "../project-templates", sample);
    for (const environment of ["dev", "prod"]) {
      const { model, diagnostics } = loadDefinitions(root, {
        packs: [databricks, adf],
        environment,
      });
      expect(model, JSON.stringify(diagnostics)).toBeDefined();
      expect(adf.build(model!)).toMatchSnapshot(environment);
    }
  },
);
