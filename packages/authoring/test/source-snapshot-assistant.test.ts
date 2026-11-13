// The source request in the editor's snapshot offers the assistant's columns file when the
// project's AGENTS.md has the guide's source metadata part (spec/cli/sources.md, section 4).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryFiles } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { guideFacts, guideSection, type GuideFacts } from "@ingestron/core/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectSnapshot } from "../src/index.js";

const conformance = join(import.meta.dirname, "../../../spec/cli/conformance/sources/request");
const expected = readFileSync(join(conformance, "request.dev.md"), "utf8");
/** The stand-in pack of the output folder cases that builds a folder per environment. */
const standIns = [{ id: "local" }] as unknown as Pack[];
const section = guideSection(
  guideFacts(
    memoryFiles({
      "project.yaml": "id: retail\nenvironments: { dev: {} }\nimports: ['*.yaml']\n",
      "standard.yaml": "kind: Standard\nid: acme\npacks: [local@2]\n",
      "a.yaml": "kind: Connection\nid: crm\n",
    }),
    "build",
    standIns,
  ) as GuideFacts,
);

let folder = "";
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "source-agents-"));
  cpSync(conformance, folder, { recursive: true });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("ProjectSnapshot.sourceRequest with the project guide", () => {
  it("is the conformance request while the folder has no AGENTS.md", () => {
    expect(ProjectSnapshot.open(folder).sourceRequest("dev")).toBe(expected);
  });

  it("ends the alternatives with the assistant's columns file when AGENTS.md has the guide", () => {
    writeFileSync(join(folder, "AGENTS.md"), section);
    const request = ProjectSnapshot.open(folder).sourceRequest("dev");
    expect(request).toContain("saved as `sources/crm.assistant.csv`.");
    expect(request).toContain("saved as `sources/erp.assistant.csv`.");
    expect(request).not.toContain("sources/landing.assistant.csv");
  });

  it("reads AGENTS.md as an open editor holds it", () => {
    const open = new Map([[join(folder, "AGENTS.md"), "# Mine\n"]]);
    expect(ProjectSnapshot.open(folder, open).sourceRequest("dev")).toBe(expected);
  });
});
