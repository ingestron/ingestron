// A mapping whose values are described, such as audit columns by name: hover on a key
// shows what each value may be, and completion offers no literal `*` key.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type * as Core from "@ingestron/core";
import { describe, expect, it, vi } from "vitest";
import { completionsAt } from "../src/assist/completion.js";
import { hoverAt } from "../src/hover/hover.js";
import { openProject } from "../src/project/project.js";
import { filledTemplates } from "./starters.js";

// The ADF pack's adf-copy, with a mapping of audit columns whose values are described.
vi.mock("@ingestron/core", async (importOriginal) => {
  const real = await importOriginal<typeof Core>();
  const audit = {
    type: "object",
    description: "Columns added to every landed row, by name.",
    additionalProperties: {
      description: "A run value, or other text written as it is.",
      anyOf: [{ enum: ["run.id"], enumDescriptions: ["The run's id."] }, { type: "string" }],
    },
  };
  const packs = real.packs.map((pack) => {
    const copy = pack.methods["adf-copy"];
    if (!copy) return pack;
    const settings = copy.settings as { properties?: Record<string, unknown> };
    const described = { ...settings, properties: { ...settings.properties, audit_columns: audit } };
    return { ...pack, methods: { ...pack.methods, "adf-copy": { ...copy, settings: described } } };
  });
  return { ...real, packs };
});

const erp = join(filledTemplates, "private-sql-server");
const original = readFileSync(join(erp, "standard.yaml"), "utf8");
const withAudit = (columns: string) =>
  original.replace(
    "start: 2026-10-01T00:00:00Z",
    `start: 2026-10-01T00:00:00Z\n      audit_columns:\n        ${columns}`,
  );

describe("a mapping's described values", () => {
  it("are not offered as a key named *", () => {
    const marked = withAudit("|");
    const text = marked.replace("|", "");
    const project = openProject(erp, new Map([[join(erp, "standard.yaml"), text]]));
    const items = completionsAt(project, "standard.yaml", text, marked.indexOf("|"), "dev");
    expect(items.map((item) => item.label)).not.toContain("*");
  });

  it("describe each key written in the mapping on hover", () => {
    const text = withAudit("_run_id: run.id");
    const project = openProject(erp, new Map([[join(erp, "standard.yaml"), text]]));
    const shown = hoverAt(project, "standard.yaml", text, text.indexOf("_run_id") + 1, "dev");
    expect(shown).toContain("A run value, or other text written as it is.");
  });
});
