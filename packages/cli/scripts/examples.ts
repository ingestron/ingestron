// Every example project and its environments, for the checks in this folder.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDefinitions, type ResolvedModel } from "@ingestron/definitions";
import { parse } from "yaml";
import { packs } from "../src/packs.js";

const samplesFolder = join(import.meta.dirname, "..");

/** Each example's resolved model per environment. Throws when a example does not resolve. */
export function exampleModels(): { name: string; model: ResolvedModel }[] {
  return ["project-templates", "test/fixtures"]
    .flatMap((kind) =>
      readdirSync(join(samplesFolder, kind), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: `${kind}/${entry.name}` })),
    )
    .flatMap((entry) => {
      const folder = join(samplesFolder, entry.name);
      const manifest = parse(readFileSync(join(folder, "project.yaml"), "utf8")) as {
        environments?: object;
      };
      return Object.keys(manifest.environments ?? { default: {} }).map((environment) => {
        const result = loadDefinitions(folder, { packs, environment });
        if (!result.model) throw new Error(`${entry.name} (${environment}) does not resolve.`);
        return { name: `${entry.name} ${environment}`, model: result.model };
      });
    });
}
