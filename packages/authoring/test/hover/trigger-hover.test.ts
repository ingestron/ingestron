// Hovering a flow trigger shows its next starts in the selected environment; its fields complete
// from the schemas.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../../src/assist/completion.js";
import { hoverAt } from "../../src/hover/hover.js";
import { openProject } from "../../src/project/project.js";
import { filledTemplates, replaced } from "../starters.js";

const erp = join(filledTemplates, "private-sql-server");
const read = (path: string) => readFileSync(join(erp, path), "utf8");
const triggers = `ingest:
  triggers:
    - name: weekly-reload
      type: schedule
      every: { frequency: Week, interval: 1 }
      start: 2026-11-01T02:00:00
      lookback: 8d
      at: { weekdays: [Sunday], hours: [2], minutes: [0] }
    - name: hourly
      type: tumbling-window
      every: { frequency: Hour, interval: 1 }
      start: 2026-12-01T00:00:00Z
tables:
`;

/** The ERP starter with a standard that sets the triggers' zone and hours, and the flow's triggers. */
function projectWith(policy: string, flow = triggers) {
  const standard = `${read("standard.yaml")}operations:\n  schedule: { per: flow }\n  triggers:\n${policy}`;
  const text = replaced(read("flows/erp.yaml"), "tables:\n", flow);
  const files = new Map([
    [join(erp, "standard.yaml"), standard],
    [join(erp, "flows/erp.yaml"), text],
  ]);
  return { text, project: openProject(erp, files) };
}

const now = new Date("2026-12-01T00:00:00Z");

function hover(policy: string, needle: string, environment = "prod", flow?: string) {
  const { text, project } = projectWith(policy, flow);
  return hoverAt(project, "flows/erp.yaml", text, text.indexOf(needle) + 2, environment, { now });
}

describe("hover on a trigger", () => {
  const zone = "    timezone: Europe/London\n";

  it("shows the next three starts in the trigger's zone", () => {
    const shown = hover(zone, "weekly-reload")!;
    expect(shown).toContain(
      "Next starts in prod (Europe/London): Sun 6 Dec 02:00, Sun 13 Dec 02:00, Sun 20 Dec 02:00.",
    );
  });

  it("shows them from any key or value of the trigger", () => {
    expect(hover(zone, "weekdays: [Sunday]")).toContain("Sun 6 Dec 02:00");
    expect(hover(zone, "type: tumbling-window")).toContain(
      "Next starts in prod (Europe/London): Tue 1 Dec 01:00",
    );
  });

  it("counts the starts from the clock of the zone, past a change of clocks", () => {
    const shown = hover(
      zone,
      "weekly-reload",
      "prod",
      triggers.replace("2026-11-01", "2026-03-22"),
    );
    expect(shown).toContain("Sun 6 Dec 02:00, Sun 13 Dec 02:00, Sun 20 Dec 02:00.");
  });

  it("says nothing when the trigger ends before now", () => {
    const flow = triggers.replace("      at:", "      end: 2026-11-30T00:00:00Z\n      at:");
    expect(hover(zone, "weekly-reload", "prod", flow) ?? "").not.toContain("Next starts");
  });

  it("says nothing outside a trigger or when the project does not resolve", () => {
    expect(hover(zone, "source: erp") ?? "").not.toContain("Next starts");
    expect(
      hover(
        zone,
        "weekly-reload",
        "prod",
        triggers.replace("every: { frequency: Week", "every: { frequency: Fortnight"),
      ) ?? "",
    ).not.toContain("Next starts");
  });
});

describe("completion in a trigger", () => {
  it("offers the tumbling window after the type", () => {
    const marked = replaced(
      read("flows/erp.yaml"),
      "tables:\n",
      triggers.replace("type: schedule", "type: |"),
    );
    const text = marked.replace("|", "");
    const open = openProject(erp, new Map([[join(erp, "flows/erp.yaml"), text]]));
    const items = completionsAt(open, "flows/erp.yaml", text, marked.indexOf("|"), "dev");
    expect(items.map((item) => item.label)).toContain("tumbling-window");
  });
});
