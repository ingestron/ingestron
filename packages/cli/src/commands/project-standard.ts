// The project's Standard document, found without loading the project (spec/cli/kits.md,
// "standard install"): project.yaml's imports, and each imported file's `kind`, `id` and
// `origin`. Nothing is checked against a schema, so a standard that the CLI now rejects, or a
// half-edited flow, does not stop the standard being replaced.
import { nodeFiles, type FileSource } from "@ingestron/config";
import { isMap, parseDocument } from "yaml";

/** The project's Standard document: its file, its id and where it came from. */
export interface ProjectStandard {
  file: string;
  /** Absent when the document has no `id` as text; the kit's own is then kept. */
  id?: string;
  origin?: { standard: string; version: string };
}

/** Each document's header: the fields read to find the Standard. */
interface Header {
  kind?: unknown;
  id?: unknown;
  origin?: { standard?: unknown; version?: unknown };
}

/** The one Standard document among the files project.yaml imports; refuses none, or several. */
export function projectStandard(folder: string): ProjectStandard {
  const files = nodeFiles(folder);
  const manifest = header(files, "project.yaml") as { imports?: unknown };
  const patterns = Array.isArray(manifest.imports)
    ? manifest.imports.filter((item): item is string => typeof item === "string")
    : [];
  const found = importedFiles(files, patterns)
    .map((file) => ({ file, header: header(files, file) }))
    .filter((item) => item.header.kind === "Standard");
  if (found.length === 0)
    throw new Error(
      "The project has no Standard document to replace. Add one to project.yaml's imports, or start a project with ingestron init --kit <kit>.",
    );
  if (found.length > 1) {
    const listed = found.map((item) => item.file).join(", ");
    throw new Error(
      `The project has ${found.length} Standard documents (${listed}); keep one, then run this again.`,
    );
  }
  const [{ file, header: standard }] = found as [(typeof found)[0]];
  const id = typeof standard.id === "string" ? { id: standard.id } : {};
  return { file, ...id, ...originOf(standard) };
}

/** The top-level fields of a file; refuses one that cannot be read or is not valid YAML. */
function header(files: FileSource, file: string): Header {
  const text = files.read(file);
  if (text === undefined)
    throw new Error(`Could not read ${file}, so the project's standard was not found.`);
  const document = parseDocument(text);
  const [problem] = document.errors;
  if (problem)
    throw new Error(
      `${file} is not valid YAML, so the project's standard was not found: ${problem.message}`,
    );
  return isMap(document.contents) ? (document.toJS() as Header) : {};
}

/** The files the imports match, in path order, as the loader reads `imports`. */
function importedFiles(files: FileSource, patterns: string[]): string[] {
  const matchers = patterns
    .map((pattern) => pattern.replace(/^(\.\/)+/, ""))
    .filter((pattern) => !pattern.startsWith("/") && !pattern.split("/").includes(".."))
    .map(globPattern);
  return files
    .list()
    .filter((path) => path !== "project.yaml" && matchers.some((matcher) => matcher.test(path)))
    .sort();
}

/**
 * A pattern of `imports` as a regular expression (spec/config/syntax.md): `*` matches any
 * characters except `/`, `**` any number of folders, and `?` one character except `/`.
 */
function globPattern(pattern: string): RegExp {
  const source = pattern
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === "**/") return "(?:.*/)?";
      if (part === "**") return ".*";
      if (part === "*") return "[^/]*";
      if (part === "?") return "[^/]";
      return part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

/** The Standard's `origin`, when it names a kit and a version as text. */
function originOf({ origin }: Header): Pick<ProjectStandard, "origin"> {
  const { standard, version } = origin ?? {};
  return typeof standard === "string" && typeof version === "string"
    ? { origin: { standard, version } }
    : {};
}
