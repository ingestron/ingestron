// What resolving and building found, as the text printed before anything is
// planned (spec/cli/outputs.md, sections 1 and 3).
import { formatDiagnostics, type AnyDiagnostic } from "@ingestron/config";
import { diagnosticKey, type Report } from "./resolve-environments.js";

/** The diagnostics that the same environments have, and those environments. */
interface Group {
  names: string[];
  diagnostics: AnyDiagnostic[];
}

/**
 * Each environment's diagnostics as text, each shown once under every environment that has it:
 * grouped by those environments, in the order of each group's first diagnostic. As
 * {@link reportsText} gives them with no pack's reports.
 * @internal
 */
export function environmentReportsText(reports: readonly Report[]): string {
  return reportsText(reports, []);
}

/** The heading of the warnings about features an engine does not apply. */
export const notAppliedHeading = "Not applied on this platform";

/**
 * What resolving and building found, as plan prints it (spec/cli/outputs.md, sections 1 and
 * 3): each environment's errors and warnings, grouped by the environments that have them,
 * then each pack's, then the `NOT_APPLIED` warnings under their heading, grouped the same
 * way, then one line counting the accepted warnings. Empty when there is nothing to say.
 * @internal
 */
export function reportsText(
  environmentReports: readonly Report[],
  packReports: readonly Report[],
): string {
  const shown = (keep: (diagnostic: AnyDiagnostic) => boolean) => (report: Report) => ({
    ...report,
    diagnostics: report.diagnostics.filter(keep),
  });
  const notApplied = (diagnostic: AnyDiagnostic) => diagnostic.code === "NOT_APPLIED";
  const others = (diagnostic: AnyDiagnostic) => !notApplied(diagnostic);
  const packGroups = (keep: (diagnostic: AnyDiagnostic) => boolean) =>
    packReports.map(shown(keep)).map(({ name, diagnostics }) => ({ names: [name], diagnostics }));
  const unapplied = [
    ...groupsOf(environmentReports.map(shown(notApplied))),
    ...packGroups(notApplied),
  ].filter(({ diagnostics }) => diagnostics.length > 0);
  return [
    groupsText(groupsOf(environmentReports.map(shown(others)))),
    groupsText(packGroups(others)),
    unapplied.length > 0 ? `${notAppliedHeading}\n${listedText(unapplied)}` : "",
    acceptedLine([...environmentReports, ...packReports]),
  ].join("");
}

/** The groups under the heading: each its environments, then its diagnostics. */
function listedText(groups: readonly Group[]): string {
  return groups
    .map(({ names, diagnostics }) => `${names.join(", ")}:\n${formatDiagnostics(diagnostics)}\n`)
    .join("");
}

/** `<n> accepted warnings (<file>)`, counting each accepted warning once; empty for none. */
function acceptedLine(reports: readonly Report[]): string {
  const accepted = reports.flatMap((report) => report.accepted ?? []);
  if (accepted.length === 0) return "";
  const count = new Set(accepted.map((item) => diagnosticKey(item.diagnostic))).size;
  const files = [...new Set(accepted.map((item) => item.entry.file))].join(", ");
  return `${count} accepted ${count === 1 ? "warning" : "warnings"} (${files})\n`;
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
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
      const rest = diagnostics.filter((diagnostic) => diagnostic.severity !== "error");
      const heading = errors.length > 0 ? "the definitions have problems" : "warnings";
      return `${names.join(", ")}: ${heading}\n${formatDiagnostics([...errors, ...rest])}\n`;
    })
    .join("");
}

function groupsOf(reports: readonly Report[]): Group[] {
  const found = new Map<string, { diagnostic: AnyDiagnostic; names: string[] }>();
  for (const { name, diagnostics } of reports)
    for (const diagnostic of diagnostics) {
      const key = diagnosticKey(diagnostic);
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
