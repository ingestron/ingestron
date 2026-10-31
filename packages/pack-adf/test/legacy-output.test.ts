import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadDefinitions } from "@ingestron/definitions";
import { databricks } from "@ingestron/pack-databricks";
import { expect, it } from "vitest";
import { adf } from "../src/index.js";
it.each(["private-sql-server", "private-files"])(
  "preserves every existing ADF file in %s",
  (sample) => {
    const root = join(import.meta.dirname, "../../../samples/starters", sample);
    for (const environment of ["dev", "prod"]) {
      const { model, diagnostics } = loadDefinitions(root, {
        packs: [databricks, adf],
        environment,
      });
      expect(model, JSON.stringify(diagnostics)).toBeDefined();
      const actual = adf.build(model!);
      const expected: Record<string, string> = {};
      for (const folder of ["linkedService", "dataset", "pipeline", "trigger"]) {
        for (const name of readdirSync(join(root, "build", environment, "adf", folder)))
          expected[`${folder}/${name}`] = readFileSync(
            join(root, "build", environment, "adf", folder, name),
            "utf8",
          );
      }
      expect(actual).toEqual(expected);
    }
  },
);
