// Moves a method setting to the file its method says it belongs in: the
// platform for shared infrastructure, the standard for organisation choices.
import type { Fix } from "@ingestron/config";
import { packs } from "@ingestron/cli";
import { parse } from "yaml";
import { placeAt } from "./context.js";
import { settingsAt } from "./fields.js";
import { positioned, type QuickFix } from "./fixes.js";
import { openProject, resolved, type Project } from "./project.js";
import { spotAt } from "./yaml.js";

const pointerOf = (segments: string[]) =>
  segments.map((segment) => `/${segment.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");

/** The move for the setting whose key is at `offset`, when it is written outside where it belongs. */
export function moveSetting(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): QuickFix[] {
  const found = misplaced(project, file, text, offset, environment);
  const target = found && fileOfKind(project, found.belongs);
  if (!found || !target) return [];
  const { key, method, action, from } = found;
  const to =
    found.belongs === "Platform" ? ["settings", method, key] : [action, "settings", method, key];
  const taken = valueAt(parse(project.files.read(target) ?? ""), to) !== undefined;
  const fix: Fix = {
    title: `Move ${key} to ${target}${taken ? ", replacing the value there" : ""}${scope(project, method, action, environment)}`,
    edits: [
      { file, pointer: pointerOf(from), remove: true },
      { file: target, pointer: pointerOf(to), set: valueAt(parse(text), from) },
    ],
  };
  const edits = positioned(project, fix);
  // Both halves, or nothing: a value written as ${…} cannot be replaced in place.
  return edits.length === 2 ? [{ title: fix.title, edits }] : [];
}

/**
 * Which tables a setting moved out of one table reaches: every table whose
 * step uses the method, so the person sees the move widen before choosing it.
 */
function scope(
  project: Project,
  method: string,
  action: string,
  environment: string | undefined,
): string {
  const model =
    resolved(project, environment).model ??
    resolved(openProject(project.folder, new Map()), environment).model;
  const step = action as "ingest" | "transform" | "store";
  const names = (model?.tables ?? [])
    .filter((table) => table[step]?.method === method)
    .map((table) => table.name);
  if (names.length === 0) return "";
  const shown = names.length > 5 ? [...names.slice(0, 5), `${names.length - 5} more`] : names;
  return `; it applies to every ${method} table: ${shown.join(", ")}`;
}

/** A method setting at `offset` whose method places it in another kind of file. */
interface Misplaced {
  key: string;
  method: string;
  action: string;
  belongs: "Platform" | "Standard";
  /** The setting's own keys, from the document root. */
  from: string[];
}

function misplaced(
  project: Project,
  file: string,
  text: string,
  offset: number,
  environment: string | undefined,
): Misplaced | undefined {
  const spot = spotAt(text, offset);
  if (!spot) return undefined;
  const place = placeAt(file, text, offset);
  const settings = settingsAt(project, place, spot.segments, environment);
  const key = settings?.rest[0];
  const method = settings && methodNamed(settings.method);
  if (!settings || !key || !method) return undefined;
  const belongs = placementOf(method, key);
  if (!belongs || belongs === place.kind) return undefined;
  const from = spot.segments.slice(0, spot.segments.length - settings.rest.length + 1);
  return { key, method: settings.method, action: method.action, belongs, from };
}

/** The kind of file a setting belongs in, when its method says. */
function placementOf(
  method: NonNullable<ReturnType<typeof methodNamed>>,
  key: string,
): Misplaced["belongs"] | undefined {
  if (method.placement?.platform?.includes(key)) return "Platform";
  return method.placement?.standard?.includes(key) ? "Standard" : undefined;
}

function methodNamed(id: string) {
  return packs.find((pack) => pack.methods[id])?.methods[id];
}

/** The project's file with a document of this kind. */
function fileOfKind(project: Project, kind: string): string | undefined {
  const pattern = new RegExp(`^kind:\\s*${kind}\\s*$`, "m");
  return project.files
    .list()
    .find((path) => /\.ya?ml$/.test(path) && pattern.test(project.files.read(path) ?? ""));
}

function valueAt(value: unknown, segments: string[]): unknown {
  return segments.reduce<unknown>(
    (node, segment) =>
      node !== null && typeof node === "object"
        ? (node as Record<string, unknown>)[segment]
        : undefined,
    value,
  );
}
