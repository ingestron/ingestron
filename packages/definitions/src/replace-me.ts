// REPLACE_ME: the text `ingestron init` writes where it cannot know a value. Each place it
// was written is reported once, a warning, or an error for `check` (specification section 1).
import type { AnyDiagnostic, FileSource, Project } from "@ingestron/config";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from "yaml";
import type { ResolveOptions, ResolveResult } from "./resolve.js";

/** The text that stands for a value only the project's owner knows. */
export const replaceMe = "REPLACE_ME";

const hint =
  "Ingestron cannot know this value. The comment above it says what it is; README.md says where to find it. A value that differs per environment goes in project.yaml under environments.<name>.values.";

/** Where REPLACE_ME was written, and the field the message names. */
interface Place {
  file: string;
  line: number;
  column: number;
  field: string;
}

/** A parsed YAML file, for finding what was written at a line and column. */
interface Parsed {
  scalars: { line: number; column: number; node: Node }[];
  root: Node | null;
  lines: LineCounter;
}

const references = (text: string, resolver: string) =>
  [...text.matchAll(new RegExp(`\\$\\{${resolver}:?([^}]*)\\}`, "g"))].map((match) =>
    match[1]!.replace(/^\./, ""),
  );

/** The result with each REPLACE_ME; as errors, the project no longer resolves. */
export function withReplaceMe(
  files: FileSource,
  project: Project,
  options: Pick<ResolveOptions, "replaceMe">,
  result: ResolveResult,
): ResolveResult {
  const severity = options.replaceMe ?? "warning";
  const found = replaceMeDiagnostics(files, project, severity);
  if (found.length === 0) return result;
  const diagnostics = [...result.diagnostics, ...found];
  return severity === "error" ? { ok: false, diagnostics } : { ...result, diagnostics };
}

/**
 * One diagnostic for each place where a value the documents read holds REPLACE_ME, for the
 * project's selected environment, in the order the documents read them.
 */
export function replaceMeDiagnostics(
  files: FileSource,
  project: Project,
  severity: "warning" | "error",
): AnyDiagnostic[] {
  const finder = placeFinder(files, project);
  const places = new Map<string, Place>();
  for (const document of project.documents)
    visitText(document.value, [], (keys, text) => {
      if (!holds(project, text)) return;
      const pointer = keys.map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
      const place = finder(document.locate(pointer.join("")), keys.join("."), text);
      places.set(`${place.file}:${place.line}:${place.column}`, place);
    });
  return [...places.values()].map(({ file, line, column, field }) => ({
    code: "REPLACE_ME",
    severity,
    message: `${field} is still REPLACE_ME: write the real value before deploying.`,
    hint,
    location: { file, line, column },
  }));
}

/** Text that holds REPLACE_ME, or a `${values.…}` a transform's code still holds that does. */
function holds(project: Project, text: string): boolean {
  if (text.includes(replaceMe)) return true;
  return references(text, "values").some((name) => {
    const value = name
      .split(".")
      .reduce<unknown>((at, key) => (at as never)?.[key], project.values);
    return typeof value === "string" && value.includes(replaceMe);
  });
}

function visitText(value: unknown, keys: string[], visit: (keys: string[], text: string) => void) {
  if (typeof value === "string") visit(keys, value);
  else if (Array.isArray(value))
    value.forEach((item, index) => visitText(item, [...keys, String(index)], visit));
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) visitText(item, [...keys, key], visit);
}

type Location = { file: string; line: number; column: number };

/** Finds where the text at a location came from, by the rules of specification section 1. */
function placeFinder(files: FileSource, project: Project) {
  const cache = new Map<string, Parsed | undefined>();
  const parsed = (file: string) => {
    if (!cache.has(file)) cache.set(file, parse(files.read(file)));
    return cache.get(file);
  };
  const fromValue = (name: string, depth: number): Place | undefined => {
    const manifest = parsed("project.yaml");
    const parts = name.split(".");
    const node =
      (project.environment !== undefined &&
        nodeAt(manifest?.root, ["environments", project.environment, "values", ...parts])) ||
      nodeAt(manifest?.root, ["values", ...parts]);
    if (!manifest || !isScalar(node) || typeof node.value !== "string") return undefined;
    if (node.value.includes(replaceMe))
      return { ...position(manifest, node, "project.yaml"), field: `values.${name}` };
    if (depth > 8) return undefined;
    return first(references(node.value, "values"), (other) => fromValue(other, depth + 1));
  };
  // `text` is the resolved value: a code file's own `${values.…}` are in it.
  return (at: Location, field: string, text: string): Place => {
    const raw = scalarAt(parsed(at.file), at);
    if (raw === undefined || raw.includes(replaceMe)) return lineIn(files, at, field);
    const fromValues = (written: string) =>
      first(references(written, "values"), (name) => fromValue(name, 0));
    return (
      fromValues(raw) ??
      first(references(raw, "file"), (path) => fromFile(files, at.file, path, field)) ??
      fromValues(text) ?? { ...at, field }
    );
  };
}

function first<T, R>(items: T[], find: (item: T) => R | undefined): R | undefined {
  for (const item of items) {
    const found = find(item);
    if (found) return found;
  }
  return undefined;
}

/** The location itself, or, in a file that is not YAML, its first line that holds the text. */
function lineIn(files: FileSource, at: Location, field: string): Place {
  if (/\.ya?ml$/.test(at.file)) return { ...at, field };
  return firstLine(files.read(at.file) ?? "", at.file, field) ?? { ...at, field };
}

/** The first line of the file a `${file:…}` reads that holds the text. */
function fromFile(files: FileSource, from: string, path: string, field: string) {
  const [file = ""] = path.split("#");
  const folder = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const joined = normalise(`${folder}${file}`);
  return firstLine(files.read(joined) ?? "", joined, field);
}

function normalise(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/"))
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  return parts.join("/");
}

function firstLine(text: string, file: string, field: string): Place | undefined {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(replaceMe));
  if (index < 0) return undefined;
  return { file, line: index + 1, column: lines[index]!.indexOf(replaceMe) + 1, field };
}

function parse(text: string | undefined): Parsed | undefined {
  if (text === undefined) return undefined;
  const lines = new LineCounter();
  const document = parseDocument(text, { lineCounter: lines });
  const scalars: Parsed["scalars"] = [];
  const visit = (node: unknown): void => {
    if (isMap(node) || isSeq(node))
      for (const item of node.items) visit(isMap(node) ? (item as { value: unknown }).value : item);
    else if (isScalar(node) && node.range) {
      const { line, col } = lines.linePos(node.range[0]);
      scalars.push({ line, column: col, node });
    }
  };
  visit(document.contents);
  return { scalars, root: document.contents, lines };
}

/** The text written at the location, when it is a scalar of a YAML file. */
function scalarAt(file: Parsed | undefined, at: Location): string | undefined {
  const found = file?.scalars.find((item) => item.line === at.line && item.column === at.column);
  const value = found && isScalar(found.node) ? found.node.value : undefined;
  return typeof value === "string" ? value : undefined;
}

function nodeAt(root: Node | null | undefined, keys: string[]): Node | undefined {
  let node: unknown = root;
  for (const key of keys) node = isMap(node) ? node.get(key, true) : undefined;
  return (node as Node | undefined) ?? undefined;
}

function position(file: Parsed, node: Node, path: string): Location {
  const { line, col } = file.lines.linePos(node.range?.[0] ?? 0);
  return { file: path, line, column: col };
}
