// What resolving and building found, as the text printed before anything is
// planned (spec/cli/outputs.md, sections 1 and 3).
import { formatDiagnostics, type AnyDiagnostic } from "@ingestron/config";
import type { Report } from "./resolve-environments.js";

/** The diagnostics that the same environments have, and those environments. */
interface Group {
  names: string[];
  diagnostics: AnyDiagnostic[];
}

/**
 * Each environment's diagnostics as text, each shown once under every environment that has it:
 * grouped by those environments, in the order of each group's first diagnostic.
 * @internal
 */
export function environmentReportsText(reports: readonly Report[]): string {
  return groupsText(groupsOf(reports));
}

/**
 * Each pack's problems, or its warnings, as text.
 * @internal
 */
export function packReportsText(reports: readonly Report[]): string {
  return groupsText(reports.map(({ name, diagnostics }) => ({ names: [name], diagnostics })));
}

function groupsText(groups: readonly Group[]): string {
  return groups
    .filter(({ diagnostics }) => diagnostics.length > 0)
    .map(({ names, diagnostics }) => {
      const failed = diagnostics.some((diagnostic) => diagnostic.severity === "error");
      const heading = failed ? "the definitions have problems" : "warnings";
      return `${names.join(", ")}: ${heading}\n${formatDiagnostics(diagnostics)}\n`;
    })
    .join("");
}

/** Two diagnostics are the same when their code, file, line and message are. */
function keyOf({ code, message, location }: AnyDiagnostic): string {
  return JSON.stringify([code, location?.file, location?.line, message]);
}

function groupsOf(reports: readonly Report[]): Group[] {
  const found = new Map<string, { diagnostic: AnyDiagnostic; names: string[] }>();
  for (const { name, diagnostics } of reports)
    for (const diagnostic of diagnostics) {
      const key = keyOf(diagnostic);
      const seen = found.get(key);
      if (!seen) found.set(key, { diagnostic, names: [name] });
      else if (!seen.names.includes(name)) seen.names.push(name);
    }
  const groups = new Map<string, Group>();
  for (const { diagnostic, names } of found.values()) {
    const key = names.join("\n");
    const group = groups.get(key);
    if (group) group.diagnostics.push(diagnostic);
    else groups.set(key, { names, diagnostics: [diagnostic] });
  }
  return [...groups.values()];
}
