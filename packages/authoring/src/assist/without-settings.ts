// The project as it reads without the settings an unfinished edit may have left half written.
import { parse, stringify } from "yaml";
import type { Project } from "../project/index.js";

const stripped = new WeakMap<Project, Map<string, Project>>();

/** The project with every `with` in `file` removed, once per project snapshot and file. */
export function withoutSettings(project: Project, file: string): Project {
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
