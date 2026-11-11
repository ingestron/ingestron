// What resolving and building found, printed before anything is planned
// (spec/cli/outputs.md, sections 1 and 3).
import type { Io } from "./io.js";
import { reportsText } from "@ingestron/core/internal";
import type { Generated } from "@ingestron/core";

/**
 * Each environment's errors and warnings, grouped by the environments that have them, then
 * each pack's, then the warnings not applied on this platform, then the accepted count.
 */
export function printReports(
  io: Io,
  { environmentReports, packReports }: Pick<Generated, "environmentReports" | "packReports">,
): void {
  const text = reportsText(environmentReports, packReports);
  if (text !== "") io.write(text);
}
