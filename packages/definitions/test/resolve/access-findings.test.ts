// Reporting what access judging found (specification section 8.2): one warning for each
// declaring line, with or without a known place.
import { describe, expect, it } from "vitest";
import type { Context } from "../../src/context/index.js";
import { createReporter } from "../../src/diagnostics/index.js";
import { reportFindings, type Finding } from "../../src/resolve/access-findings.js";

/** A context with no Platform and no packs: all that reporting a finding reads. */
function bareContext(): Context {
  return { packs: [], platform: undefined, reporter: createReporter() } as unknown as Context;
}

const off: Finding = {
  code: "CAPABILITY_OFF",
  at: undefined,
  what: 'The "hash" mask on "email"',
  feature: "masks",
  capability: "masks",
  pack: "databricks",
  column: "email",
  table: "customers",
};

describe("reportFindings", () => {
  it("reports a capability that is off without a place when its declaring line is not known", () => {
    const context = bareContext();
    reportFindings(context, [off]);
    expect(context.reporter.diagnostics).toEqual([
      {
        code: "CAPABILITY_OFF",
        severity: "warning",
        message:
          'The "hash" mask on "email" in table "customers" is not applied: the platform has masks off.',
        hint: "Turn it on with manage.masks in platform.yaml.",
        subject: { table: "customers", feature: "masks" },
      },
    ]);
  });

  it("reports a feature not applied without a place when its declaring line is not known", () => {
    const context = bareContext();
    reportFindings(context, [{ ...off, code: "NOT_APPLIED", reason: "It has no data masking." }]);
    expect(context.reporter.diagnostics).toMatchObject([
      { code: "NOT_APPLIED", subject: { table: "customers", feature: "masks" } },
    ]);
    expect(context.reporter.diagnostics[0]?.location).toBeUndefined();
  });
});
