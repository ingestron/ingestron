// The facts the project guide is written from: read from project.yaml and the files it imports,
// as YAML, without resolving (spec/cli/assistants.md, section 4, "Lists, and where the facts come from").
import { matchesImport, type FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { packs as corePacks } from "../packs/index.js";
import { byCodePoint } from "../code-point.js";
import { flowText, isMapping, readYaml, stringAt, stringsAt, type Mapping } from "./yaml.js";

/**
 * What the standard says that the guide repeats.
 * @internal
 */
export interface GuideStandard {
  id: string;
  /** The path of the file the standard is in. */
  file: string;
  /** `<standard>@<version>` of the published standard it came from, as its `origin` says. */
  origin?: string;
  /** The rest of the file's first line when it starts `# From `. */
  from?: string;
  /** True when the project has a `STANDARD.md`. */
  explained: boolean;
  /** The packs, as the standard writes them (`id@version`). */
  packs: string[];
  /** The methods each action allows, in the order the standard writes them. */
  allowed: { action: string; methods: string[] }[];
  /** The settings each method fixes, with each value as YAML flow text. */
  fixed: { action: string; method: string; settings: [key: string, value: string][] }[];
  /** The keys of the standard's top-level `fixed`. */
  fixedIntent: string[];
}

/**
 * One generated folder of the project: a pack's, in the order the guide lists them.
 * @internal
 */
export interface GuideOutput {
  /** The pack's id. */
  id: string;
  /** The pack as the guide names it: the standard's `id@version`, or the id for a `runs-on` pack. */
  name: string;
  /** The folder, such as `build/databricks/`. */
  folder: string;
  /** Whether the pack builds every environment together; `undefined` for a pack the CLI lacks. */
  together?: boolean;
}

/**
 * Everything the guide's text is made from.
 * @internal
 */
export interface GuideFacts {
  project: string;
  /** The output folder, relative to the project folder, with `/` separators and no final one. */
  out: string;
  environments: { name: string; runsOn?: string }[];
  /** The patterns of `imports`, as written. */
  imports: string[];
  standard?: GuideStandard;
  /** The pack folders; the data product folder is `products`. */
  outputs: GuideOutput[];
  /** True when a `DataProduct` document is imported. */
  products: boolean;
  /** Every `${envvar:NAME}` name the files hold, in code point order. */
  envvars: string[];
  /** The ids of the imported `Connection` documents, in code point order. */
  connections: string[];
}

/** Why there is no guide: the exact line `init` and `assistant add` print. */
export interface NoGuide {
  noGuide: string;
}

const envvarName = /\$\{envvar:([A-Za-z_][A-Za-z0-9_]*)\}/g;
/** The actions of a standard, in the order the guide lists them. No other key counts. */
const actions = ["ingest", "transform", "store", "serve"];

/**
 * The facts for the guide of the project in `files`, or why there is none. `out` is the output
 * folder relative to the project folder; `available` are the packs the CLI has (by default
 * core's). Nothing is resolved, a file that does not parse is skipped, and a `.env` file is never read.
 * @internal
 */
export function guideFacts(
  files: FileSource,
  out: string,
  available: readonly Pack[] = corePacks,
): GuideFacts | NoGuide {
  const text = files.read("project.yaml") ?? "";
  const manifest = readManifest(text);
  if ("noGuide" in manifest) return manifest;
  const id = stringAt(manifest.fields, "id")!;
  const imports = stringsAt(manifest.fields, "imports");
  const { documents, names } = readImported(files, imports, text);
  const ofKind = (kind: string): Mapping[] =>
    documents.flatMap(({ value }) =>
      isMapping(value) && value.get("kind") === kind ? [value] : [],
    );
  const found = documents.find(
    ({ value }) =>
      isMapping(value) && value.get("kind") === "Standard" && stringAt(value, "id") !== undefined,
  );
  const standard = found && standardFrom(found.value as Mapping, found.path, found.text, files);
  const environments = environmentsOf(manifest.fields);
  const folder = out.replaceAll("\\", "/").replace(/\/+$/, "");
  return {
    project: id,
    out: folder,
    environments,
    imports,
    ...(standard && { standard }),
    outputs: outputsOf(standard?.packs ?? [], environments, folder, available),
    products: ofKind("DataProduct").length > 0,
    envvars: [...names].sort(byCodePoint),
    connections: [
      ...new Set(ofKind("Connection").flatMap((document) => stringAt(document, "id") ?? [])),
    ].sort(byCodePoint),
  };
}

/** The mapping of project.yaml, or why there is no guide. */
function readManifest(text: string): { fields: Mapping } | NoGuide {
  const read = readYaml(text);
  if (read === undefined || !isMapping(read.value))
    return { noGuide: "No guide: project.yaml cannot be read." };
  if (stringAt(read.value, "id") === undefined)
    return { noGuide: "No guide: project.yaml has no id." };
  return { fields: read.value };
}

/** The imported files that parse, as documents, and every `${envvar:NAME}` name in them and in project.yaml. */
function readImported(
  files: FileSource,
  imports: readonly string[],
  manifestText: string,
): { documents: { path: string; text: string; value: unknown }[]; names: Set<string> } {
  const documents: { path: string; text: string; value: unknown }[] = [];
  const names = new Set<string>();
  const note = (source: string) => {
    for (const match of source.matchAll(envvarName)) names.add(match[1]!);
  };
  note(manifestText);
  for (const path of importedPaths(files, imports)) {
    const source = files.read(path);
    const read = source === undefined ? undefined : readYaml(source);
    if (source === undefined || read === undefined) continue;
    note(source);
    documents.push({ path, text: source, value: read.value });
  }
  return { documents, names };
}

/** The files the patterns match, each once, in code point order; never a `.env` file. */
function importedPaths(files: FileSource, imports: readonly string[]): string[] {
  return files
    .list()
    .filter((path) => path !== "project.yaml" && !isEnvFile(path))
    .filter((path) => imports.some((pattern) => matchesImport(pattern, path)))
    .sort(byCodePoint);
}

function isEnvFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name === ".env" || name.startsWith(".env.");
}

function environmentsOf(manifest: Mapping): GuideFacts["environments"] {
  const declared = manifest.get("environments");
  if (!isMapping(declared)) return [];
  return [...declared].map(([name, environment]) => {
    const runsOn = isMapping(environment) ? stringAt(environment, "runs-on") : undefined;
    return { name: String(name), ...(runsOn !== undefined && { runsOn }) };
  });
}

/** The packs of the standard, then any `runs-on` pack not among them, each with its folder. */
function outputsOf(
  listed: readonly string[],
  environments: GuideFacts["environments"],
  out: string,
  available: readonly Pack[],
): GuideOutput[] {
  const idOf = (name: string) => name.split("@")[0]!;
  const names = [...listed];
  for (const { runsOn } of environments)
    if (runsOn !== undefined && !names.some((name) => idOf(name) === idOf(runsOn)))
      names.push(runsOn);
  return names.map((name) => {
    const id = idOf(name);
    const pack = available.find((candidate) => candidate.id === id);
    return {
      id,
      name,
      folder: `${out}/${id}/`,
      ...(pack && { together: typeof pack.buildEnvironments === "function" }),
    };
  });
}

/** A key's value when it is a string or a number (a version may be written either way), as text. */
function scalarAt(mapping: Mapping, key: string): string | undefined {
  const value = mapping.get(key);
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function standardFrom(
  document: Mapping,
  file: string,
  text: string,
  files: FileSource,
): GuideStandard {
  const origin = document.get("origin");
  const published = isMapping(origin)
    ? { standard: stringAt(origin, "standard"), version: scalarAt(origin, "version") }
    : undefined;
  const first = text.replace(/^﻿/, "").split("\n", 1)[0]!.replace(/\r$/, "");
  const comment = first.startsWith("# From ") ? first.slice("# From ".length).trim() : "";
  const fixedKeys = document.get("fixed");
  return {
    id: stringAt(document, "id")!,
    file,
    ...(published?.standard !== undefined &&
      published.version !== undefined && { origin: `${published.standard}@${published.version}` }),
    ...(comment !== "" && { from: comment }),
    explained: files.list().includes("STANDARD.md"),
    packs: stringsAt(document, "packs"),
    ...actionsOf(document),
    fixedIntent: isMapping(fixedKeys) ? [...fixedKeys.keys()].map(String) : [],
  };
}

/** What each action of a standard allows and fixes: the actions in a fixed order, the methods as the standard writes them. */
function actionsOf(document: Mapping): Pick<GuideStandard, "allowed" | "fixed"> {
  const allowed: GuideStandard["allowed"] = [];
  const fixed: GuideStandard["fixed"] = [];
  for (const key of actions) {
    const rules = document.get(key);
    if (!isMapping(rules)) continue;
    const methods = stringsAt(rules, "allowed");
    if (methods.length > 0) allowed.push({ action: key, methods });
    const methodsFixed = rules.get("fixed");
    if (!isMapping(methodsFixed)) continue;
    for (const [method, settings] of methodsFixed) {
      if (!isMapping(settings) || settings.size === 0) continue;
      fixed.push({
        action: key,
        method: String(method),
        settings: [...settings].map(([name, value]) => [String(name), flowText(value)]),
      });
    }
  }
  return { allowed, fixed };
}
