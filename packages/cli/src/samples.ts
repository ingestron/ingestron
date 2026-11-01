// The samples users read and start from. Starters are complete projects that
// `ingestron init` and VS Code create a project from (each has template.yaml),
// in this package's project-templates/. Guides are small projects that each
// show one idea (each has sample.yaml); the documentation keeps its own and
// lists them with the same functions. What a sample uses is found by resolving it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefinitions, type ResolvedModel } from "@ingestron/definitions";
import { parse } from "yaml";
import { packs } from "./packs.js";

/** One sample: where it is, what kind, and how it is listed. */
export interface Sample {
  name: string;
  kind: "starter" | "guide";
  folder: string;
  title: string;
  summary: string;
}

/** What a sample's project uses, across its environments. */
export interface SampleFacts {
  packs: string[];
  connectors: string[];
  connectivity: string[];
  methods: string[];
  environments: string[];
  /** Such as "quality checks", "transforms", "change data" or "several packs". */
  features: string[];
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The starters' folder: `project-templates/` beside `dist/`, in the repository and installed. */
export const templatesFolder = join(packageRoot, "project-templates");

/**
 * The samples in `folder`: starters, smallest first, or guides in their order.
 * @example listSamples().map((sample) => sample.name) // ["minimal", …]
 */
export function listSamples(folder = templatesFolder, kind: Sample["kind"] = "starter"): Sample[] {
  const folders = foldersIn(folder);
  return kind === "starter"
    ? folders
        .map((path) => readSample(path, kind))
        .sort((a, b) => size(a.folder) - size(b.folder) || a.name.localeCompare(b.name))
    : folders.sort((a, b) => orderOf(a) - orderOf(b)).map((path) => readSample(path, kind));
}

/** The packs, connectors, connectivity, methods, environments and features a sample uses. */
export function sampleFacts(folder: string): SampleFacts {
  const manifest = parse(readFileSync(join(folder, "project.yaml"), "utf8")) as {
    environments?: object;
  };
  const environments = Object.keys(manifest.environments ?? {});
  const models = (environments.length > 0 ? environments : [undefined]).flatMap((environment) => {
    const { model } = loadDefinitions(folder, {
      packs,
      environment,
      envvars: {},
    });
    return model ? [model] : [];
  });
  const all = <T>(pick: (model: ResolvedModel) => T[]) => [...new Set(models.flatMap(pick))];
  const tables = models.flatMap((model) => model.tables);
  return {
    packs: all((model) => model.standard.packs.map((pack) => pack.split("@")[0]!)),
    connectors: all((model) =>
      model.tables.flatMap((table) => table.ingest?.connection.connector ?? []),
    ),
    connectivity: all((model) =>
      model.tables.flatMap((table) => table.ingest?.connection.connectivity ?? []),
    ),
    methods: all((model) =>
      model.tables.flatMap((table) =>
        [table.ingest, table.transform, table.store, table.serve].flatMap(
          (step) => step?.method ?? [],
        ),
      ),
    ),
    environments,
    features: features(models, tables),
  };
}

function features(models: ResolvedModel[], tables: ResolvedModel["tables"]): string[] {
  const manage = models.flatMap((model) =>
    Object.entries(model.platform.manage).flatMap(([id, on]) => (on ? [`manages ${id}`] : [])),
  );
  return [
    ...new Set([
      // Its own rules, not the not-null checks every required column gets.
      ...(tables.some(
        (table) =>
          table.expectations.some((item) => item.from === "definition") ||
          table.contract.checks.length + table.contract.tableChecks.length > 0,
      )
        ? ["quality checks"]
        : []),
      ...(tables.some((table) => table.transform) ? ["transforms"] : []),
      ...(tables.some((table) => table.endsAtFiles) ? ["ends at the landed files"] : []),
      ...(tables.some((table) => ["upsert", "history"].includes(String(table.store?.settings.mode)))
        ? ["change data"]
        : []),
      ...(models.some((model) => model.standard.packs.length > 1) ? ["several packs"] : []),
      ...(models.some((model) => model.platform.schedule) ? ["schedule"] : []),
      ...manage,
    ]),
  ];
}

function foldersIn(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(folder, entry.name));
}

/**
 * One sample folder, listed from its `template.yaml` (starter) or `sample.yaml` (guide).
 * @example readSample(folder, "guide").title
 */
export function readSample(folder: string, kind: Sample["kind"]): Sample {
  const file = kind === "starter" ? "template.yaml" : "sample.yaml";
  const data = (parse(readFileSync(join(folder, file), "utf8")) ?? {}) as Record<string, unknown>;
  const name = folder.split(/[\\/]/).pop()!;
  return {
    name,
    kind,
    folder,
    title: String(data.title ?? name),
    summary: String(data.summary ?? ""),
  };
}

function orderOf(folder: string): number {
  const data = parse(readFileSync(join(folder, "sample.yaml"), "utf8")) as { order?: number };
  return data.order ?? Number.MAX_SAFE_INTEGER;
}

/** Definition files, so the smallest starter comes first. */
function size(folder: string): number {
  const files = (path: string): number =>
    readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.name !== "build")
      .reduce(
        (sum, entry) =>
          sum +
          (entry.isDirectory()
            ? files(join(path, entry.name))
            : /\.ya?ml$/.test(entry.name)
              ? 1
              : 0),
        0,
      );
  return files(folder);
}
