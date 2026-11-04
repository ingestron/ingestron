// The ADF files generated for the two private starters, kept as a snapshot so
// any change to them is reviewed: one factory folder, and a parameter file per
// environment.
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { expect, it } from "vitest";
import { packs } from "../src/packs.js";
import { generateAll } from "../src/request-supplied.js";

it.each(["private-sql-server", "private-files"])(
  "keeps the ADF files generated for %s",
  (sample) => {
    const root = join(import.meta.dirname, "../project-templates", sample);
    const generated = generateAll(nodeFiles(root), packs, {});
    expect(generated.ok).toBe(true);
    const adf = generated.outputs.find((output) => output.name === "adf");
    expect(adf?.targets).toEqual(["dev", "prod"]);
    expect(adf?.files).toMatchSnapshot();
  },
);
