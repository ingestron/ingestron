// Quick fixes: the fixes the definitions give for the problems at a place,
// as text edits with line and character positions.
import { fixEdits, type Fix } from "@ingestron/config";
import { parse } from "yaml";
import { problems, type Problem } from "./diagnostics.js";
import type { Project } from "./project.js";
import { plainText, skeletons } from "./skeletons.js";
import { occurrences } from "./navigation.js";
import { offsetAt, positionAt, type Position } from "./yaml.js";

/** One quick fix: its title, the problem it solves, and edits that may span files. */
export interface QuickFix {
  title: string;
  /** The problem it solves; absent for a refactoring, such as moving a setting. */
  problem?: { code: string; line: number };
  edits: { file: string; range: { start: Position; end: Position }; text: string }[];
  /** A new file to write, for a link to a document that does not exist yet. */
  create?: { file: string; text: string };
}

/** The fixes for the problems in `file` whose lines meet `at`. */
export function quickFixes(
  project: Project,
  environment: string | undefined,
  file: string,
  at: { start: Position; end: Position },
): QuickFix[] {
  const here = problems(project, environment)
    .filter((problem) => problem.file === file)
    .filter(({ range }) => range.start.line <= at.end.line && range.end.line >= at.start.line);
  const edited = here
    .flatMap((problem) =>
      (problem.fixes ?? []).map((fix) => ({
        title: fix.title,
        problem: { code: problem.code, line: problem.range.start.line },
        edits: positioned(project, fix),
      })),
    )
    .filter((fix) => fix.edits.length > 0);
  return [...edited, ...here.flatMap((problem) => createFixes(project, problem))];
}

/** A fix's text edits, at line and character positions. */
export function positioned(project: Project, fix: Fix): QuickFix["edits"] {
  const read = (path: string) => project.files.read(path);
  return fixEdits(fix, read).map(({ file, start, end, text }) => {
    const source = read(file) ?? "";
    return {
      file,
      range: { start: positionAt(source, start), end: positionAt(source, end) },
      text,
    };
  });
}

/** Folders for the kinds a link can name, where a new document is written. */
const folders: Record<string, string> = { DataContract: "contracts", Connection: "connections" };

/** For a link to a contract or connection that does not exist: create it from its skeleton. */
function createFixes(project: Project, problem: Problem): QuickFix[] {
  if (problem.code === "NO_STANDARD") return createStandard(project, problem);
  const { kind, id } = (problem.code === "BROKEN_LINK" && linkAt(project, problem)) || {};
  const folder = kind && folders[kind];
  if (!id || !folder) return [];
  const file = newFileFor(project, folder, id);
  const [skeleton] = skeletons(project, file, id);
  if (!skeleton?.snippet) return [];
  return [
    {
      title: `Create ${kind} "${id}"`,
      problem: { code: problem.code, line: problem.range.start.line },
      edits: [],
      create: { file, text: plainText(skeleton.snippet) },
    },
  ];
}

/** `<folder>/<last part of the id>.yaml`, or the whole id when that file exists. */
function newFileFor(project: Project, folder: string, id: string): string {
  const short = `${folder}/${id.split(".").at(-1)}.yaml`;
  return project.files.read(short) === undefined ? short : `${folder}/${id}.yaml`;
}

/** The kind and id of the link written where the problem is. */
function linkAt(project: Project, problem: Problem): { kind: string; id: string } | undefined {
  const offset = offsetAt(project.files.read(problem.file) ?? "", problem.range.start);
  const link = occurrences(project).find(
    ({ file, range, definition, symbol }) =>
      file === problem.file &&
      !definition &&
      symbol.startsWith("doc:") &&
      range[0] <= offset &&
      offset <= range[1],
  );
  const [, kind, id] = /^doc:(\w+):(.+)$/.exec(link?.symbol ?? "") ?? [];
  return kind && id ? { kind, id } : undefined;
}

/** standard.yaml from its skeleton, and added to the imports when they do not load it. */
function createStandard(project: Project, problem: Problem): QuickFix[] {
  const file = "standard.yaml";
  const [skeleton] = skeletons(project, file);
  if (!skeleton?.snippet || project.files.read(file) !== undefined) return [];
  let imports: unknown;
  try {
    imports = (parse(project.files.read("project.yaml") ?? "") as { imports?: unknown })?.imports;
  } catch {
    return [];
  }
  const loaded =
    Array.isArray(imports) &&
    imports.some((item) => /^(standard|\*+(\/\*)?)\.yaml$/.test(String(item)));
  const add = { title: "", edits: [{ file: "project.yaml", pointer: "/imports/-", set: file }] };
  return [
    {
      title: `Create "${file}"`,
      problem: { code: problem.code, line: problem.range.start.line },
      edits: loaded ? [] : positioned(project, add),
      create: { file, text: plainText(skeleton.snippet) },
    },
  ];
}
