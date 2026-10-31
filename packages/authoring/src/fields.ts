// The description of the field at a place: a document's own field, or a
// method setting wherever settings are written (the standard's settings and
// fixed, the platform's settings, a rule's `with`, a flow's or table's `with`).
import { standardPacks } from "./smart.js";
import { packs } from "@ingestron/cli";
import {
  documentReference,
  methodReference,
  referenceKinds,
  type Connector,
  type FieldInfo,
} from "@ingestron/definitions";
import type { Place } from "./context.js";
import { parse, stringify } from "yaml";
import { openProject, resolved, type Project } from "./project.js";

/** A method's settings at a place: the method and the keys below its settings. */
export interface SettingsAt {
  method: string;
  rest: string[];
}

/** The method whose settings `path` is in, if any. */
export function settingsAt(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
): SettingsAt | undefined {
  return (
    platformSettings(place, path) ??
    standardSettings(place, path) ??
    withSettings(project, place, path, environment)
  );
}

/** `settings/<method>/…` in a platform. */
function platformSettings(
  place: Place,
  [first, method, ...rest]: string[],
): SettingsAt | undefined {
  return place.kind === "Platform" && first === "settings" && method ? { method, rest } : undefined;
}

/** `<action>/settings/<method>/…` or `<action>/fixed/<method>/…` in a standard. */
function standardSettings(
  place: Place,
  [action = "", group = "", method, ...rest]: string[],
): SettingsAt | undefined {
  const standard = place.kind === "Standard" && /^(ingest|transform|store|serve)$/.test(action);
  return standard && /^(settings|fixed)$/.test(group) && method ? { method, rest } : undefined;
}

/** A rule's `with` in a standard, or a flow's, transform's or table's `with`. */
function withSettings(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
): SettingsAt | undefined {
  const at = path.indexOf("with");
  if (at < 0) return undefined;
  const rest = path.slice(at + 1);
  const [action = "", group, index] = path;
  const method =
    place.kind === "Standard" && group === "when"
      ? (place.data[action] as { when?: ({ use?: string } | null)[] } | undefined)?.when?.[
          Number(index)
        ]?.use
      : methodOfTable(project, place.file, path.slice(0, at), environment);
  return method ? { method, rest } : undefined;
}

/** Every setting of a method, from the pack that has it. */
export function methodFields(method: string): FieldInfo[] {
  const pack = packs.find((candidate) => candidate.methods[method]);
  return pack ? methodReference(pack, method) : [];
}

/** The description of the field at `path`, or undefined when nothing describes it. */
export function fieldAt(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
): FieldInfo | undefined {
  const settings = settingsAt(project, place, path, environment);
  if (settings)
    return methodFields(settings.method).find((field) => matches(field.path, settings.rest));
  return (
    connectorFields(place, project, environment).find((field) => matches(field.path, path)) ??
    documentFields(place).find((field) => matches(field.path, path))
  );
}

/** The connector a Connection document names, from the pack that reads it. */
export function connectorOf(
  place: Place,
  project?: Project,
  environment?: string,
): Connector | undefined {
  if (place.kind !== "Connection") return undefined;
  const own = project ? standardPacks(project) : packs;
  const candidates = own.flatMap((pack) =>
    (pack.connectors ?? []).filter(
      (item) =>
        item.id === place.data.connector &&
        (pack.methods[item.method]?.connectivity ?? [place.data.connectivity]).includes(
          String(place.data.connectivity),
        ),
    ),
  );
  const method = project
    ? resolved(project, environment).model?.tables.find(
        (table) => table.ingest?.connection.id === place.data.id,
      )?.ingest?.method
    : undefined;
  return (
    candidates.find((item) => item.method === method) ??
    (candidates.length === 1 ? candidates[0] : undefined)
  );
}

/**
 * A connection's `settings`, described by its connector: what each means,
 * and how a flow table's `object` is written for it.
 */
function connectorFields(place: Place, project: Project, environment?: string): FieldInfo[] {
  const connector = connectorOf(place, project, environment);
  if (!connector) return [];
  return connector.settings.map((setting) => ({
    path: ["settings", setting.name],
    name: setting.name,
    description: `${setting.description} For ${connector.title}, a flow table's \`object\` is ${connector.object}.${setting.secret ? " Write it as ${secret:<name>}." : ""}`,
    type: setting.type ?? "text",
    required: !setting.optional,
    ...(setting.values && { values: setting.values.map((value) => ({ value })) }),
    docs: `/docs/connectors/${connector.id}`,
  }));
}

/** The fields directly inside the mapping at `path`. */
export function fieldsIn(
  project: Project,
  place: Place,
  path: string[],
  environment: string | undefined,
): FieldInfo[] | undefined {
  const settings = settingsAt(project, place, path, environment);
  const [all, base] = settings
    ? [methodFields(settings.method), settings.rest]
    : [[...connectorFields(place, project, environment), ...documentFields(place)], path];
  if (!settings && !(place.kind && place.kind in referenceKinds)) return undefined;
  return all.filter(
    (field) => field.path.length === base.length + 1 && matches(field.path.slice(0, -1), base),
  );
}

function documentFields(place: Place): FieldInfo[] {
  const kind = place.kind as keyof typeof referenceKinds | undefined;
  return kind && kind in referenceKinds ? documentReference(kind) : [];
}

/** A described path matches when each key is the same or the description says `*`. */
function matches(described: string[], path: string[]): boolean {
  return (
    described.length === path.length &&
    described.every((key, index) => key === "*" || key === path[index])
  );
}

/** The method of the table's step that `path` (up to its `with`) belongs to. */
function methodOfTable(
  project: Project,
  file: string,
  path: string[],
  environment: string | undefined,
): string | undefined {
  const name = path[0] === "tables" ? path[1] : undefined;
  const action = (name ? path[2] : path[0]) as "ingest" | "transform" | "store" | "serve";
  const methodIn = (candidate: Project) =>
    resolved(candidate, environment).model?.tables.find(
      (item) => item.origin.file === file && (!name || item.name === name),
    )?.[action]?.method;
  // An unfinished setting stops the project resolving. The text as written,
  // without its `with` settings, still chooses the method; the saved files
  // are the last resort, as they may say something else.
  return (
    methodIn(project) ??
    methodIn(withoutSettings(project, file)) ??
    methodIn(openProject(project.folder, new Map()))
  );
}

const stripped = new WeakMap<Project, Map<string, Project>>();

/** The project with every `with` in `file` removed, once per project snapshot and file. */
function withoutSettings(project: Project, file: string): Project {
  let byFile = stripped.get(project);
  if (!byFile) stripped.set(project, (byFile = new Map()));
  let found = byFile.get(file);
  if (!found) {
    const text = stripWith(project.files.read(file) ?? "");
    const files = {
      ...project.files,
      read: (path: string) => (path === file ? text : project.files.read(path)),
    };
    byFile.set(file, (found = { ...project, files }));
  }
  return found;
}

/** The document without the `with` of each action, at the top and in each table. */
function stripWith(text: string): string {
  let data: unknown;
  try {
    data = parse(text);
  } catch {
    return text;
  }
  if (!isObject(data)) return text;
  const tables = isObject(data.tables) ? Object.values(data.tables) : [];
  for (const owner of [data, ...tables].filter(isObject))
    for (const action of ["ingest", "transform", "store", "serve"]) {
      const step = owner[action];
      if (isObject(step)) delete step.with;
    }
  return stringify(data);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
