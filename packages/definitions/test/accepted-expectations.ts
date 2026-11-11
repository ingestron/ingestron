// How a conformance case's expected diagnostics and accepted warnings are compared with a
// resolved result's (specification section 9).
import { expect } from "vitest";
import { severitiesOf } from "../src/accept/index.js";
import type { Diagnostic, ResolveResult } from "../src/index.js";
import { comparableSubject } from "./table-expectations.js";

/** A diagnostic as the cases write it: its location flattened, its fixes as titles. */
export function flattened({ code, severity, message, hint, location, fixes, subject }: Diagnostic) {
  return {
    code,
    severity,
    message,
    hint,
    ...location,
    // A diagnostic without fixes has none, so a case can say `fixes: []`.
    fixes: (fixes ?? []).map((fix) => fix.title),
    subject: comparableSubject(subject),
  };
}

/** Every problem is reported at a level its code lists, so that `accept` judges codes rightly. */
export function checkSeverities(found: Diagnostic[]): void {
  for (const { code, severity } of found)
    expect(severitiesOf(code), `${code} lists ${severity}`).toContain(severity);
}

/** The accepted warnings, in order, each as a diagnostic with the entry's reason and place. */
export function checkAccepted(
  actual: ResolveResult["accepted"],
  wanted: Record<string, unknown>[],
): void {
  const found = actual.map(({ diagnostic, reason, entry }) => ({
    ...flattened(diagnostic),
    reason,
    entry,
  }));
  expect(found).toHaveLength(wanted.length);
  wanted.forEach((item, index) => expect(found[index]).toMatchObject(item));
}
