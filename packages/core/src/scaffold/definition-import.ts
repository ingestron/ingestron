// The import that loads a new connection, flow or contract (spec/cli/projects.md, "The new file's
// import"): the folder's pattern for its first file, otherwise the file's own path.
import type { FileSource } from "@ingestron/config";
import { withSourcesImport } from "../sources/index.js";

/** An entry added at the end of project.yaml's imports, and project.yaml's new text. @public */
export interface AddedImport {
  /** `connections/*.yaml`, or the file's own path when its folder holds another YAML file. */
  added: string;
  project: string;
}

/**
 * The import to add for a new definition file, or undefined when an import already matches it
 * or the folder has no project.yaml. Comments and layout in project.yaml are kept.
 * @example definitionImport(files, "connections/erp.yaml") // { added: "connections/*.yaml", project: "…" }
 * @public
 */
export function definitionImport(files: FileSource, file: string): AddedImport | undefined {
  const text = files.read("project.yaml");
  if (text === undefined || withSourcesImport(text, file) === undefined) return undefined;
  const slash = file.lastIndexOf("/");
  const folder = file.slice(0, slash + 1);
  const others = files
    .list()
    .some(
      (path) =>
        path !== file &&
        path.startsWith(folder) &&
        !path.slice(folder.length).includes("/") &&
        /\.ya?ml$/.test(path),
    );
  const pattern = slash === -1 || others ? undefined : `${folder}*.yaml`;
  const viaPattern = pattern === undefined ? undefined : withSourcesImport(text, pattern);
  if (pattern !== undefined && viaPattern !== undefined)
    return { added: pattern, project: viaPattern };
  return { added: file, project: withSourcesImport(text, file)! };
}
