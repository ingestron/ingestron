// Validate the composed project before the scaffold writer creates any files.
import { memoryFiles, formatDiagnostics } from "@ingestron/config";
import { resolveDefinitions } from "@ingestron/definitions";
import { parse } from "yaml";
import type { Content } from "./scaffold.js";
import { packs } from "./packs.js";
/** All requested environments must resolve, including the selected standard. */
export function projectProblem(files: Record<string, Content>): string | undefined {
  const source = memoryFiles(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content.toString()])),
  );
  const project = parse(String(files["project.yaml"])) as { environments?: object };
  const names = Object.keys(project.environments ?? {});
  for (const environment of names.length ? names : [undefined]) {
    const result = resolveDefinitions(source, { packs, environment });
    if (!result.model)
      return `Project is not compatible in ${environment}; nothing written.\n${formatDiagnostics(result.diagnostics)}`;
  }
  return undefined;
}
