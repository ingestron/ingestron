// The conformance packs: data-only packs, with stand-ins for what a real pack does in code.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Method, Pack, PackInfo, SourceColumnDoc } from "../src/index.js";

/** A pack file: a pack's information, with stand-ins for what is code. */
type DataPack = PackInfo & {
  buildEnvironments?: true;
  checks?: string[];
  metadataTypes?: Record<string, string>;
};

/** The conformance packs, from their files in `folder`. */
export function dataPacks(folder: string): (PackInfo | Pack)[] {
  return [
    "pack.yaml",
    "pack-bridge.yaml",
    "pack-local.yaml",
    "pack-fold.yaml",
    "pack-checked.yaml",
    "pack-plain.yaml",
    "pack-three.yaml",
    "pack-intent.yaml",
    "pack-ops.yaml",
    "pack-databricks.yaml",
    "pack-rule.yaml",
    "pack-quality.yaml",
    "pack-zones.yaml",
    "pack-dedupe.yaml",
    "pack-views.yaml",
    "pack-jobs.yaml",
    "pack-workspace.yaml",
    "pack-exact.yaml",
  ].map((file) => packOf(parse(readFileSync(join(folder, file), "utf8")) as DataPack));
}

/**
 * A data-only pack. `buildEnvironments: true` stands for a pack that builds environments
 * together; `checks` on the pack or a method, for a `check` that returns those messages;
 * `metadataTypes`, for a `metadataType` that gives the type for a column's `sourceType`.
 */
function packOf(data: DataPack): PackInfo | Pack {
  const methods = Object.fromEntries(
    Object.entries(data.methods).map(([id, method]) => {
      const { checks, ...rest } = method as Method & { checks?: string[] };
      return [id, checks ? { ...rest, check: () => checks } : rest];
    }),
  );
  const { checks, buildEnvironments: together, metadataTypes, ...info } = data;
  const pack: PackInfo = {
    ...info,
    methods,
    ...(checks && { check: () => checks }),
    ...(metadataTypes && {
      metadataType: (column: SourceColumnDoc) => metadataTypes[column.sourceType ?? ""],
    }),
  };
  if (!together) return pack;
  const buildEnvironments = () => ({ files: {}, deployValues: [], problems: [] });
  return { ...pack, build: () => ({}), buildEnvironments };
}
