// Problems as the CLI finds them, for one environment, at their file and
// line: loading and resolving with the CLI's packs, template.yaml, and
// generated files changed by hand.
import { parseTemplate } from "@ingestron/cli";
import { kinds } from "@ingestron/definitions";
import { digestOf } from "@ingestron/generate";
import type { Fix } from "@ingestron/config";
import { loadedDocuments, resolved, type Project } from "./project.js";
import type { Position } from "./yaml.js";

/** One problem in one file of the project. */
export interface Problem {
  /** Path relative to the project, with "/". */
  file: string;
  range: { start: Position; end: Position };
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Changes that each solve it, when the definitions know them. */
  fixes?: Fix[];
}

// The editor replaces the project after edits or filesystem events, just as
// resolution and navigation do. Cursor requests can share the same checks.
const snapshots = new WeakMap<Project, Map<string | undefined, Problem[]>>();

/** Every problem for the environment, checked once per project snapshot. */
export function problems(project: Project, environment: string | undefined): Problem[] {
  let byEnvironment = snapshots.get(project);
  if (!byEnvironment) snapshots.set(project, (byEnvironment = new Map()));
  let result = byEnvironment.get(environment);
  if (!result) {
    result = [
      ...definitionProblems(project, environment),
      ...templateProblems(project),
      ...editedProblems(project),
      ...notImportedProblems(project, environment),
    ];
    byEnvironment.set(environment, result);
  }
  // Callers may edit their diagnostics without changing another feature's view.
  return structuredClone(result);
}

/**
 * Definition files that project.yaml's imports leave out. They are not part
 * of the project, so nothing is generated from them and nothing else reports
 * them; say so, with a fix that imports their folder.
 */
function notImportedProblems(project: Project, environment: string | undefined): Problem[] {
  const imported = importedFiles(project, environment);
  if (!imported) return [];
  const names = new Set(Object.values(kinds).map((kind) => kind.kind));
  return project.files
    .list()
    .filter((path) => /\.ya?ml$/.test(path) && !imported.has(path))
    .filter((path) => !/(^|\/)build\//.test(path) && !/^(project|template)\.ya?ml$/.test(path))
    .filter((path) => names.has(kindOf(project.files.read(path) ?? "") ?? ""))
    .map((path) => {
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const pattern = folder ? `${folder}/*${path.slice(path.lastIndexOf("."))}` : path;
      return {
        ...atStart(
          path,
          "warning",
          "NOT_IMPORTED",
          "This file is not part of the project: no import in project.yaml matches it, so nothing is generated from it.",
        ),
        fixes: [
          {
            title: `Import "${pattern}" in project.yaml`,
            edits: [{ file: "project.yaml", pointer: "/imports/-", set: pattern }],
          },
        ],
      };
    });
}

/** The files the project's imports load; undefined when it does not load. */
function importedFiles(project: Project, environment: string | undefined): Set<string> | undefined {
  const documents = loadedDocuments(project, environment);
  return documents && new Set(documents.map((document) => document.file));
}

/** The `kind:` a YAML file declares at its top level, if any. */
function kindOf(text: string): string | undefined {
  return /^kind:\s*["']?([A-Za-z]+)["']?\s*$/m.exec(text)?.[1];
}

function definitionProblems(project: Project, environment: string | undefined): Problem[] {
  const { diagnostics } = resolved(project, environment);
  return diagnostics.map((diagnostic) => {
    const file = diagnostic.location?.file ?? "project.yaml";
    const line = (diagnostic.location?.line ?? 1) - 1;
    const character = (diagnostic.location?.column ?? 1) - 1;
    const text = project.files.read(file) ?? "";
    const message = diagnostic.hint
      ? `${diagnostic.message}\n${diagnostic.hint}`
      : diagnostic.message;
    return {
      file,
      range: {
        start: { line, character },
        end: { line, character: tokenEnd(text, line, character) },
      },
      severity: diagnostic.severity,
      code: diagnostic.code,
      message,
      ...(diagnostic.fixes && { fixes: diagnostic.fixes }),
    };
  });
}

function templateProblems(project: Project): Problem[] {
  const text = project.files.read("template.yaml");
  if (text === undefined) return [];
  try {
    parseTemplate(text, "template", project.folder);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [atStart("template.yaml", "error", "TEMPLATE", message)];
  }
}

/** Generated files whose text no longer matches the digest their manifest records. */
function editedProblems(project: Project): Problem[] {
  return project.files
    .list()
    .filter((path) => path === ".generated.json" || path.endsWith("/.generated.json"))
    .flatMap((manifest) => {
      const base = manifest.slice(0, -".generated.json".length);
      const recorded = manifestFiles(project.files.read(manifest));
      return Object.entries(recorded).flatMap(([path, digest]) => {
        const text = project.files.read(`${base}${path}`);
        if (text === undefined || digestOf(text) === digest) return [];
        const message =
          "Changed by hand since it was generated: the next apply reports a conflict. Move the change into the definitions, or delete the file to generate it again.";
        return [atStart(`${base}${path}`, "warning", "EDITED", message)];
      });
    });
}

function manifestFiles(text: string | undefined): Record<string, string> {
  try {
    return (JSON.parse(text ?? "{}") as { files?: Record<string, string> }).files ?? {};
  } catch {
    return {};
  }
}

function atStart(
  file: string,
  severity: Problem["severity"],
  code: string,
  message: string,
): Problem {
  return {
    file,
    severity,
    code,
    message,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  };
}

/** The end of the word at a position, so the squiggle covers the value, not the line. */
function tokenEnd(text: string, line: number, character: number): number {
  const rest = (text.split("\n")[line] ?? "").slice(character);
  const word = /^[^\s,}\]]+/.exec(rest)?.[0].length ?? 0;
  return character + Math.max(word, 1);
}
