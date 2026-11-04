// What resolving and building found, printed before anything is planned
// (spec/cli/outputs.md, sections 1 and 3).
import { formatDiagnostics, type AnyDiagnostic } from "@ingestron/config";
import type { Io } from "./io.js";
import type { Report } from "./resolve-environments.js";

/** The diagnostics that the same environments have, and those environments. */
interface Group {
  names: string[];
  diagnostics: AnyDiagnostic[];
}

/**
 * Each environment's diagnostics, each shown once under every environment that has it:
 * grouped by those environments, in the order of each group's first diagnostic.
 */
export function printEnvironmentReports(io: Io, reports: readonly Report[]): void {
  printGroups(io, groupsOf(reports));
}

/** Each pack's problems, or its warnings. */
export function printPackReports(io: Io, reports: readonly Report[]): void {
  printGroups(
    io,
    reports.map(({ name, diagnostics }) => ({ names: [name], diagnostics })),
  );
}

function printGroups(io: Io, groups: readonly Group[]): void {
  for (const { names, diagnostics } of groups) {
    if (diagnostics.length === 0) continue;
    const failed = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    const heading = failed ? "the definitions have problems" : "warnings";
    io.write(`${names.join(", ")}: ${heading}\n${formatDiagnostics(diagnostics)}\n`);
  }
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
