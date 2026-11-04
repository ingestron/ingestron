// The stand-in packs of the output folder cases (spec/cli/outputs.md, section 8):
// the data-only packs of the definitions cases, with builds that show where
// files go, not what a real pack writes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  compareTargets,
  type EnvironmentsBuild,
  type Method,
  type Pack,
  type PackInfo,
  type ResolvedModel,
} from "@ingestron/definitions";

const folder = join(import.meta.dirname, "../../../spec/definitions/conformance");

/** A pack file: a pack's information, with stand-ins for what is code. */
type DataPack = PackInfo & { buildEnvironments?: true; checks?: string[] };

/** Every data-only pack, as the CLI is given them. */
export const standInPacks: Pack[] = [
  "pack.yaml",
  "pack-bridge.yaml",
  "pack-local.yaml",
  "pack-fold.yaml",
  "pack-checked.yaml",
].map((file) => standIn(parse(readFileSync(join(folder, file), "utf8")) as DataPack));

function standIn(data: DataPack): Pack {
  const methods = Object.fromEntries(
    Object.entries(data.methods).map(([id, method]) => {
      const { checks, ...rest } = method as Method & { checks?: string[] };
      return [id, checks ? { ...rest, check: () => checks } : rest];
    }),
  );
  const { checks, buildEnvironments: together, ...info } = data;
  const pack: Pack = {
    ...info,
    methods,
    ...(checks && { check: () => checks }),
    build: (model) => ({ "tables.txt": tables(model, info.id) }),
  };
  return together ? { ...pack, buildEnvironments: (models) => fold(models, info.id) } : pack;
}

/** A line per table with a step of the pack: its name, and its connection's `settings.path`. */
function tables(model: ResolvedModel, pack: string): string {
  return model.tables
    .filter((table) =>
      [table.ingest, table.transform, table.store, table.serve].some((step) => step?.pack === pack),
    )
    .map((table) => {
      const path = table.ingest?.connection.settings.path;
      return typeof path === "string" ? `${table.name} ${path}\n` : `${table.name}\n`;
    })
    .join("");
}

/** The first target's tables with each deploy-time value as `$(FOLD_<name>)`, and the targets. */
function fold(models: Readonly<Record<string, ResolvedModel>>, pack: string): EnvironmentsBuild {
  const all = Object.values(models);
  const values = all
    .flatMap((model) => model.deployValues ?? [])
    .filter((value, index, list) => list.findIndex((item) => item.name === value.name) === index);
  const first = values.reduce(
    (text, value) => text.replaceAll(value.text, `$(FOLD_${value.name})`),
    tables(all[0]!, pack),
  );
  return {
    files: { "tables.txt": first, "targets.txt": Object.keys(models).map((name) => `${name}\n`).join("") },
    deployValues: values.map((value) => ({ name: value.name, suppliedAs: [`FOLD_${value.name}`] })),
    problems: compareTargets(models).structural,
  };
}
