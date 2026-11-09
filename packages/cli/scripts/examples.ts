// Every example project, generated as plan generates it, for the checks in this folder.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { nodeFiles } from "@ingestron/config";
import { generateAll, type Output } from "@ingestron/core";
import { packs } from "@ingestron/core";

const samplesFolder = join(import.meta.dirname, "..");
/** The package an example kind lives in: starters are in core. */
const folderOf = (name: string): string =>
  name.startsWith("project-templates") ? join(samplesFolder, "../core") : samplesFolder;

/** Each example's output folders. Throws when an example does not generate. */
export function exampleOutputs(): { name: string; outputs: Output[] }[] {
  return ["project-templates", "test/fixtures"]
    .flatMap((kind) =>
      readdirSync(join(folderOf(kind), kind), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${kind}/${entry.name}`),
    )
    .map((name) => {
      const generated = generateAll(nodeFiles(join(folderOf(name), name)), packs, process.env);
      if (!generated.ok) throw new Error(`${name} does not generate.`);
      return { name, outputs: generated.outputs };
    });
}
