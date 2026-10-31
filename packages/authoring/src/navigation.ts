// Go to definition and references. One index of the project lists every
// place an id is defined or used; these and rename all read from it, so they agree.
import { kinds } from "@ingestron/definitions";
import { dirname, join, normalize } from "node:path";
import type { Project } from "./project.js";
import { allSpots, type Spot } from "./yaml.js";

/** A range of text in a project file (offsets). */
export interface Place {
  file: string;
  range: [number, number];
}

interface Occurrence extends Place {
  /** What the place names, such as `doc:Connection:shop`, `table:orders` or `value:host`. */
  symbol: string;
  definition: boolean;
}

const links = Object.values(kinds).flatMap((kind) =>
  Object.entries(kind.links ?? {}).map(([pointer, target]) => ({
    kind: kind.kind,
    pattern: pointer.split("/").slice(1),
    target,
  })),
);

/** Where the id or reference at the offset is defined. */
export function definitionAt(project: Project, file: string, offset: number): Place | undefined {
  const here = occurrencesAt(project, file, offset);
  const path = here.find((item) => item.symbol.startsWith("file:"))?.symbol.slice("file:".length);
  if (path)
    return project.files.read(path) === undefined ? undefined : { file: path, range: [0, 0] };
  const symbols = new Set(here.map((item) => item.symbol));
  const found = occurrences(project).find((item) => symbols.has(item.symbol) && item.definition);
  return found && { file: found.file, range: found.range };
}

/**
 * Every place that defines or uses what is at the offset. A transform's id
 * names both the transform and its table, so both are followed.
 */
export function referencesAt(project: Project, file: string, offset: number): Place[] {
  const symbols = new Set(
    occurrencesAt(project, file, offset)
      .map((item) => item.symbol)
      .filter((symbol) => !symbol.startsWith("file:")),
  );
  const seen = new Set<string>();
  return occurrences(project)
    .filter((item) => symbols.has(item.symbol))
    .filter((item) => {
      const key = `${item.file}:${item.range[0]}`;
      return !seen.has(key) && seen.add(key) !== undefined;
    })
    .map(({ file: path, range }) => ({ file: path, range }));
}

/** The definitions and uses at the offset in `file`. */
export function occurrencesAt(project: Project, file: string, offset: number): Occurrence[] {
  return occurrences(project).filter(
    (item) => item.file === file && offset >= item.range[0] && offset <= item.range[1],
  );
}

const cache = new WeakMap<Project, Occurrence[]>();

/** Every definition and reference in the project's own files, computed once per project snapshot. */
export function occurrences(project: Project): Occurrence[] {
  let found = cache.get(project);
  if (!found) cache.set(project, (found = scan(project)));
  return found;
}

function scan(project: Project): Occurrence[] {
  const paths = project.files
    .list()
    .filter((path) => !path.startsWith("build/") && !path.includes("/build/"));
  const code = transformCode(project, paths);
  return paths.flatMap((path) => {
    const text = project.files.read(path) ?? "";
    const inText = /\.(ya?ml|sql|py)$/.test(path) ? textOccurrences(path, text, code) : [];
    return /\.ya?ml$/.test(path) ? [...yamlOccurrences(path, text), ...inText] : inText;
  });
}

/** The files transforms include as their code with `${file:…}`: only there is `tables["x"]` an input. */
function transformCode(project: Project, paths: string[]): Set<string> {
  return new Set(
    paths
      .filter((path) => /\.ya?ml$/.test(path))
      .flatMap((path) => {
        const text = project.files.read(path) ?? "";
        if (!/^kind:\s*Transform\s*$/m.test(text)) return [];
        return [...text.matchAll(/\$\{file:([^}#]+)/g)].map((match) => included(path, match[1]!));
      }),
  );
}

/** A `${file:…}` path, relative to the including file, as a project path. */
function included(file: string, path: string): string {
  return normalize(join(dirname(file), path))
    .split("\\")
    .join("/");
}

function yamlOccurrences(file: string, text: string): Occurrence[] {
  let spots: Spot[];
  try {
    spots = allSpots(text);
  } catch {
    return [];
  }
  const kind = spots.find((item) => item.pointer === "/kind" && item.part === "value")?.text;
  return spots.flatMap((item) =>
    symbolsOf(file, kind, item).map(([symbol, definition]) => ({
      file,
      range: unquoted(text, item.range),
      symbol,
      definition,
    })),
  );
}

type Rule = (file: string, kind: string | undefined, item: Spot) => [string, boolean][] | undefined;

/** What each key or value names; the first rule that answers wins. */
const rules: Rule[] = [
  (_file, kind, { pointer, part, text }) =>
    part === "value" && pointer === "/id" && kind
      ? [
          [`doc:${kind}:${text}`, true],
          ...(kind === "Transform" ? [[`table:${text}`, true] as [string, boolean]] : []),
        ]
      : undefined,
  (_file, kind, { segments, part, text }) =>
    kind === "Flow" && part === "key" && segments.length === 2 && segments[0] === "tables"
      ? [[`table:${text}`, true]]
      : undefined,
  (_file, kind, { segments, part, text }) =>
    kind === "Transform" && part === "value" && segments.length === 2 && segments[0] === "inputs"
      ? [[`table:${text}`, false]]
      : undefined,
  (file, _kind, { segments, part, text }) =>
    file === "project.yaml" && part === "key" && segments.length === 2 && segments[0] === "values"
      ? [[`value:${text}`, true]]
      : undefined,
  // An environment's override of a value is the same value: rename must change it too.
  (file, _kind, { segments, part, text }) =>
    file === "project.yaml" &&
    part === "key" &&
    segments.length === 4 &&
    segments[0] === "environments" &&
    segments[2] === "values"
      ? [[`value:${text}`, false]]
      : undefined,
  (_file, kind, { segments, part, text }) => {
    if (part !== "value") return undefined;
    const link = links.find((item) => item.kind === kind && matches(item.pattern, segments));
    return link && [[`doc:${link.target}:${text}`, false]];
  },
];

function symbolsOf(file: string, kind: string | undefined, item: Spot): [string, boolean][] {
  for (const rule of rules) {
    const found = rule(file, kind, item);
    if (found) return found;
  }
  return [];
}

function matches(pattern: string[], segments: string[]): boolean {
  return (
    pattern.length === segments.length &&
    pattern.every((part, index) => part === "*" || part === segments[index])
  );
}

/**
 * References written inside text: `${values.x}`, `${file:…}` and
 * `{{ tables.x }}`, and in Python `tables["x"]`, the DataFrame of input `x`.
 */
function textOccurrences(file: string, text: string, code: Set<string>): Occurrence[] {
  const found: Occurrence[] = [];
  const add = (
    expression: RegExp,
    symbol: (name: string) => string,
    skip?: (text: string, offset: number) => boolean,
  ) => {
    for (const match of text.matchAll(expression)) {
      if (skip?.(text, match.index)) continue;
      const name = match[1]!;
      const start = match.index + match[0].indexOf(name);
      found.push({
        file,
        range: [start, start + name.length],
        symbol: symbol(name),
        definition: false,
      });
    }
  };
  add(/\$\{values\.([A-Za-z_]\w*)/g, (name) => `value:${name}`);
  add(/\{\{\s*tables\.([A-Za-z_]\w*)\s*\}\}/g, (name) => `table:${name}`);
  if (code.has(file))
    add(/\btables\[\s*["']([A-Za-z_]\w*)["']\s*\]/g, (name) => `table:${name}`, inComment);
  add(/\$\{file:([^}#]+)/g, (path) => `file:${included(file, path)}`);
  return found;
}

/** True when the offset is after a `#` on its line: a Python comment. */
function inComment(text: string, offset: number): boolean {
  return text.slice(text.lastIndexOf("\n", offset) + 1, offset).includes("#");
}

/** A quoted scalar's range without its quotes, so a rename keeps them. */
function unquoted(text: string, [start, end]: [number, number]): [number, number] {
  const quote = text[start];
  return (quote === '"' || quote === "'") && text[end - 1] === quote
    ? [start + 1, end - 1]
    : [start, end];
}
