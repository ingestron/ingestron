// A new project from a template: the files to write, then writing them
// without ever replacing a file that is already there.
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isMap, isScalar, parseDocument, YAMLMap } from "yaml";
import type { Template } from "./templates.js";

/** What the user chose. */
export interface Answers {
  name: string;
  environments: string[];
  values: Record<string, string>;
  /** Another standard to use instead of the template's: its file and where it came from. */
  standard?: { file: string; source: string };
}

/** Never copied: the template's own description and README, and anything generated. */
const skipped = new Set([
  "template.yaml",
  "README.md",
  "build",
  ".generated.json",
  ".git",
  ".ingestron",
]);

/** A file's content: text for the files init edits, bytes for everything else. */
export type Content = string | Buffer;

/** Files to write, path → content; throws on a symbolic link in the template. */
export function scaffoldFiles(
  template: Template,
  answers: Answers,
  prepared?: Record<string, Content>,
): Record<string, Content> {
  const files: Record<string, Content> = { ...prepared };
  if (!prepared)
    for (const path of templateFiles(template, template.folder))
      files[dotted(path)] = readFileSync(join(template.folder, path));
  files[".gitignore"] = withEnvIgnores(files[".gitignore"]?.toString());
  files["project.yaml"] = projectText(files["project.yaml"]?.toString() ?? "", answers);
  if (answers.standard) {
    const text = readFileSync(answers.standard.file, "utf8");
    files["standard.yaml"] = `# From ${answers.standard.source}\n${text}`;
  }
  return files;
}

const envIgnores = [".env", ".env.*", "!.env.example"];
const envComment = "# Values for ${envvar:…}: keep them out of Git; commit a .env.example instead.";

/**
 * A .gitignore that keeps `.env` files out of Git, whatever the file ignores
 * already: only the missing lines are added, at the end and in the file's own
 * line ending. `!.env.example` always follows `.env.*`, so it is added again
 * when it sits before it.
 */
export function withEnvIgnores(text: string | undefined): string {
  const eol = text?.includes("\r\n") ? "\r\n" : "\n";
  const lines = (text ?? "").split(/\r?\n/).map((line) => line.trim());
  const added = missingEnvLines(lines);
  if (added.length === 0) return text!;
  if (!text) return [envComment, ...added, ""].join(eol);
  const base = text.endsWith("\n") ? text : `${text}${eol}`;
  // A comment explains the lines only when none of them is there already.
  const fresh = envIgnores.every((line) => !lines.includes(line));
  return `${base}${fresh ? eol + envComment + eol : ""}${added.join(eol)}${eol}`;
}

/** The .env lines to add to a file with these trimmed lines, in the order they must follow. */
function missingEnvLines(lines: string[]): string[] {
  const [env, glob, keep] = envIgnores as [string, string, string];
  const addGlob = !lines.includes(glob);
  // The exception must come after .env.* or the glob ignores .env.example again.
  const addKeep = addGlob || lines.lastIndexOf(keep) < lines.lastIndexOf(glob);
  return [
    ...(lines.includes(env) ? [] : [env]),
    ...(addGlob ? [glob] : []),
    ...(addKeep || !lines.includes(keep) ? [keep] : []),
  ];
}

/**
 * The existing .gitignore with what a new project's file adds: its own lines that are
 * missing, then the .env lines. The new file's .env lines and their comment are left to
 * {@link withEnvIgnores}, which knows where they must go.
 */
function mergedGitignore(existing: string, added: string): string {
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const have = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = added
    .split(/\r?\n/)
    .filter(
      (line) => line.trim() !== "" && line !== envComment && !envIgnores.includes(line.trim()),
    )
    .filter((line) => !have.has(line.trim()));
  const base =
    missing.length === 0 || existing.endsWith("\n") || existing === "" ? existing : existing + eol;
  return withEnvIgnores(base + missing.map((line) => line + eol).join(""));
}

/**
 * Writes the files under `target`, or returns what is in the way and writes
 * nothing: an existing entry at a path (a link too, never followed), or one
 * that is not a folder where the template needs a folder. `written` lists the
 * files created; a .gitignore that was there is added to, and `ignored` lists
 * the lines added to it, comments left out.
 */
export function writeScaffold(
  target: string,
  files: Record<string, Content>,
): { written: string[]; ignored: string[] } | { clashes: string[] } {
  const paths = Object.keys(files).sort();
  // A .gitignore that is already there is added to, never replaced.
  const merged = new Map<string, string>();
  for (const path of paths) {
    const existing = path === ".gitignore" ? regularFileText(join(target, path)) : undefined;
    if (existing !== undefined)
      merged.set(path, mergedGitignore(existing, files[path]!.toString()));
  }
  const clashes = [
    ...new Set(paths.filter((path) => !merged.has(path)).flatMap((path) => inTheWay(target, path))),
  ].sort();
  if (clashes.length > 0) return { clashes };
  const ignored: string[] = [];
  for (const path of paths) {
    const text = merged.get(path);
    if (text !== undefined) {
      ignored.push(...addedLines(regularFileText(join(target, path)) ?? "", text));
      writeFileSync(join(target, path), text);
      continue;
    }
    mkdirSync(dirname(join(target, path)), { recursive: true });
    // "wx": never replace a file that appeared after the check.
    writeFileSync(join(target, path), files[path]!, { flag: "wx" });
  }
  return { written: paths.filter((path) => !merged.has(path)), ignored };
}

/** The lines of `after` that `before` does not have, without blank lines and comments. */
function addedLines(before: string, after: string): string[] {
  const had = new Set(before.split(/\r?\n/).map((line) => line.trim()));
  return after
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !had.has(line));
}

/**
 * What init says it added to a .gitignore that was there: its own lines by name, the
 * .env lines together. Empty when nothing was added.
 */
export function ignoredText(lines: readonly string[]): string {
  const own = lines.filter((line) => !envIgnores.includes(line));
  const parts = [...own, ...(own.length < lines.length ? ["the .env lines"] : [])];
  if (parts.length === 0) return "";
  const listed =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `; added ${listed} to .gitignore`;
}

/** The text of a regular file, not a link; undefined when there is none, or something else is. */
function regularFileText(path: string): string | undefined {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  return stat?.isFile() ? readFileSync(path, "utf8") : undefined;
}

/** The path itself if anything is there, or a parent that exists but is not a folder. */
function inTheWay(target: string, path: string): string[] {
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index += 1) {
    const prefix = parts.slice(0, index).join("/");
    const stat = lstatSync(join(target, prefix), { throwIfNoEntry: false });
    if (!stat) return [];
    if (index === parts.length || !stat.isDirectory()) return [prefix];
  }
  return [];
}

/**
 * Why a project or environment name is not valid, with a valid suggestion, or
 * undefined when it is. One rule for the command, its questions and editors.
 */
export function nameProblem(text: string, what: "project" | "environment"): string | undefined {
  if (projectId(text) === text) return undefined;
  return `"${text}" is not a valid ${what} name: use lowercase letters, digits and underscores, starting with a letter. Try "${projectId(text)}".`;
}

/** A valid project id from a folder name: lowercase, other characters to `_`, a letter first. */
export function projectId(text: string): string {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(id) ? id : `p_${id}`;
}

function templateFiles(template: Template, folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    if (skipped.has(entry)) return [];
    const path = join(folder, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink())
      throw new Error(
        `Template "${template.name}" has a symbolic link: ${relative(template.folder, path)}. Templates may only hold regular files.`,
      );
    if (stat.isDirectory()) return templateFiles(template, path);
    return stat.isFile() ? [relative(template.folder, path)] : [];
  });
}

/** project.yaml with the name, environments and answers; comments are kept. */
function projectText(text: string, answers: Answers): string {
  const document = parseDocument(text);
  document.set("id", answers.name);
  const existing = document.get("environments");
  const environments = isMap(existing) ? existing : new YAMLMap<unknown, unknown>();
  // Edit the template's map in place, so comments on its environments stay.
  for (const pair of [...environments.items])
    if (!answers.environments.includes(String(isScalar(pair.key) ? pair.key.value : pair.key)))
      environments.delete(pair.key);
  for (const name of answers.environments)
    if (!environments.has(name)) environments.set(name, new YAMLMap());
  document.set("environments", environments);
  for (const [key, value] of Object.entries(answers.values)) document.setIn(["values", key], value);
  return document.toString();
}

/** npm does not ship dot files reliably, so a template's `gitignore` is written as `.gitignore`. */
function dotted(path: string): string {
  return path === "gitignore" || path.endsWith("/gitignore")
    ? path.replace(/gitignore$/, ".gitignore")
    : path;
}
