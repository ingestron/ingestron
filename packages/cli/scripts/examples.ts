// Every example project, generated as plan generates it, for the checks in this folder.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { generateAll, type Output } from "../src/build-outputs.js";
import { packs } from "../src/packs.js";

const samplesFolder = join(import.meta.dirname, "..");

/** Each example's output folders. Throws when an example does not generate. */
export function exampleOutputs(): { name: string; outputs: Output[] }[] {
  return ["project-templates", "test/fixtures"]
    .flatMap((kind) =>
      readdirSync(join(samplesFolder, kind), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${kind}/${entry.name}`),
    )
    .map((name) => {
      const generated = generateAll(nodeFiles(join(samplesFolder, name)), packs, process.env);
      if (!generated.ok) throw new Error(`${name} does not generate.`);
      return { name, outputs: generated.outputs };
    });
}
