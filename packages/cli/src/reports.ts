// What resolving and building found, printed before anything is planned
// (spec/cli/outputs.md, sections 1 and 3).
import type { Io } from "./io.js";
import { environmentReportsText, packReportsText } from "./report-text.js";
import type { Report } from "./resolve-environments.js";

/**
 * Each environment's diagnostics, each shown once under every environment that has it:
 * grouped by those environments, in the order of each group's first diagnostic.
 */
export function printEnvironmentReports(io: Io, reports: readonly Report[]): void {
  write(io, environmentReportsText(reports));
}

/** Each pack's problems, or its warnings. */
export function printPackReports(io: Io, reports: readonly Report[]): void {
  write(io, packReportsText(reports));
}

function write(io: Io, text: string): void {
  if (text !== "") io.write(text);
}
