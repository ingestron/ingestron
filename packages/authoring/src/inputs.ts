// A transform's inputs where its code names them, `{{ tables.x }}` in SQL and
// `tables["x"]` in Python: its declared inputs first, then the other tables
// with the edit that declares them. Never the transform itself, nor a table
// that already depends on it, which would make a cycle.
import type { Suggestion } from "./completion.js";
import { positioned } from "./fixes.js";
import { occurrences } from "./navigation.js";
import type { Project } from "./project.js";
import { parse } from "yaml";

/** A transform document: its file, id and declared inputs. */
interface Transform {
  file: string;
  id: string;
  inputs: string[];
}

/** Suggestions after `{{ tables.` or `tables["`, or undefined elsewhere. */
export function inputCompletions(
  project: Project,
  file: string,
  before: string,
): Suggestion[] | undefined {
  const sql = /\{\{\s*tables\.\w*$/.test(before);
  const python = /\btables\[\s*["']\w*$/.test(before);
  if (!sql && !python) return undefined;
  const transforms = transformsOf(project);
  const owner =
    transforms.find((item) => item.file === file) ??
    transforms.find((item) => codeFiles(project, item.file).includes(file));
  if (!owner) return python ? undefined : tables(project).map(reference);
  const excluded = new Set([owner.id, ...dependents(transforms, owner.id)]);
  const others = tables(project).filter(
    (name) => !owner.inputs.includes(name) && !excluded.has(name),
  );
  return [
    ...owner.inputs.map((name) => ({ ...reference(name), detail: "input" })),
    ...others.map((name) => ({
      ...reference(name),
      detail: "not an input yet: adds it to inputs",
      edits: positioned(project, {
        title: `Add ${name} to inputs`,
        edits: [{ file: owner.file, pointer: "/inputs/-", set: name }],
      }),
    })),
  ];
}

function reference(label: string): Suggestion {
  return { label, kind: "reference" };
}

/** Every table name the project defines, in order. */
function tables(project: Project): string[] {
  const names = occurrences(project)
    .filter((item) => item.definition && item.symbol.startsWith("table:"))
    .map((item) => item.symbol.slice("table:".length));
  return [...new Set(names)];
}

/** Every Transform document, read from its YAML. */
function transformsOf(project: Project): Transform[] {
  return occurrences(project)
    .filter((item) => item.definition && item.symbol.startsWith("doc:Transform:"))
    .flatMap((item) => {
      try {
        const data = parse(project.files.read(item.file) ?? "") as { inputs?: unknown } | null;
        const inputs = Array.isArray(data?.inputs) ? data.inputs.map(String) : [];
        return [{ file: item.file, id: item.symbol.slice("doc:Transform:".length), inputs }];
      } catch {
        return [];
      }
    });
}

/** The files a transform includes with `${file:…}`, such as its SQL or Python code. */
function codeFiles(project: Project, file: string): string[] {
  return occurrences(project)
    .filter((item) => item.file === file && item.symbol.startsWith("file:"))
    .map((item) => item.symbol.slice("file:".length));
}

/** The transforms that read `id`, directly or through others. */
function dependents(transforms: Transform[], id: string): string[] {
  const found = new Set<string>();
  const queue = [id];
  for (let next = queue.shift(); next !== undefined; next = queue.shift())
    for (const item of transforms)
      if (item.inputs.includes(next) && !found.has(item.id)) {
        found.add(item.id);
        queue.push(item.id);
      }
  return [...found];
}
