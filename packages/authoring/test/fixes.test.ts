// Quick fixes: the definitions' fixes for problems at a place, as text edits.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quickFixes } from "../src/fixes.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../../samples/starters/retail");

function edited(path: string, change: (text: string) => string) {
  const text = change(readFileSync(join(retail, path), "utf8"));
  return openProject(retail, new Map([[join(retail, path), text]]));
}

describe("quick fixes", () => {
  it("offers the closest id for a broken link, as an edit of just the value, then to create it", () => {
    const project = edited("flows/shop.yaml", (text) =>
      text.replace("source: shop", "source: shops"),
    );
    const at = { start: { line: 4, character: 10 }, end: { line: 4, character: 10 } };
    expect(quickFixes(project, "dev", "flows/shop.yaml", at)).toEqual([
      {
        title: 'Change to "shop"',
        problem: { code: "BROKEN_LINK", line: 4 },
        edits: [
          {
            file: "flows/shop.yaml",
            range: { start: { line: 4, character: 8 }, end: { line: 4, character: 13 } },
            text: "shop",
          },
        ],
      },
      expect.objectContaining({ title: 'Create Connection "shops"' }),
    ]);
  });

  it("offers nothing away from a problem", () => {
    const project = edited("flows/shop.yaml", (text) =>
      text.replace("source: shop", "source: shops"),
    );
    const at = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    expect(quickFixes(project, "dev", "flows/shop.yaml", at)).toEqual([]);
  });

  it("offers to create a missing contract from its skeleton", () => {
    const project = edited("flows/shop.yaml", (text) =>
      text.replace("contract: shop.orders", "contract: shop.returns"),
    );
    const at = { start: { line: 8, character: 16 }, end: { line: 8, character: 16 } };
    const create = quickFixes(project, "dev", "flows/shop.yaml", at).find((fix) =>
      fix.title.startsWith("Create"),
    );
    expect(create?.title).toBe('Create DataContract "shop.returns"');
    expect(create?.create?.file).toBe("contracts/returns.yaml");
    expect(create?.create?.text).toContain("id: shop.returns\nversion: 1.0.0\nstatus: draft\n");
    expect(create?.create?.text).toContain("  - name: returns\n");
    expect(create?.create?.text).not.toMatch(/\$\{|\$\d/);
  });

  it("writes a secret setting as ${secret:…} in a created connection", async () => {
    const { plainText } = await import("../src/skeletons.js");
    const snippet = "  password: \\${secret:${4:password}}\n";
    expect(plainText(snippet)).toBe("  password: ${secret:password}\n");
  });

  it("offers to create standard.yaml, and to load it, when the project has no standard", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-fixes-"));
    writeFileSync(
      join(folder, "project.yaml"),
      "id: shop\nenvironments: { dev: {} }\nimports: [flows/*.yaml]\n",
    );
    const project = openProject(folder, new Map());
    const at = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const [fix] = quickFixes(project, "dev", "project.yaml", at);
    expect(fix?.title).toBe('Create "standard.yaml"');
    expect(fix?.create?.file).toBe("standard.yaml");
    expect(fix?.create?.text).toMatch(
      /^apiVersion: ingestron.io\/v1\nkind: Standard\nid: \S+\npacks: \[databricks@1\]\n$/,
    );
    expect(fix?.edits).toEqual([
      expect.objectContaining({ file: "project.yaml", text: ", standard.yaml" }),
    ]);
  });
});

describe("missing method settings", () => {
  it("are one fix that adds each key, empty, in the platform, the standard and the flow", () => {
    const folder = join(import.meta.dirname, "../../../samples/starters/private-files");
    const read = (path: string) => readFileSync(join(folder, path), "utf8");
    const open = new Map([
      [join(folder, "standard.yaml"), read("standard.yaml").split("ingest:")[0]!],
      [join(folder, "platform.yaml"), read("platform.yaml").split("settings:")[0]!],
      [join(folder, "flows/stores.yaml"), read("flows/stores.yaml").replace(/ingest:\n.*\n/, "")],
    ]);
    const project = openProject(folder, open);
    const at = { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } };
    const [fix] = quickFixes(project, "dev", "flows/stores.yaml", at);
    expect(fix?.title).toBe("Add the missing settings");
    expect(fix?.edits.map((edit) => [edit.file, edit.text])).toEqual([
      [
        "platform.yaml",
        "settings:\n  adf-files:\n    landing: null\n    integration_runtime: null\n",
      ],
      ["standard.yaml", "ingest:\n  settings:\n    adf-files:\n      start: null\n"],
      ["flows/stores.yaml", "ingest:\n  with:\n    format: null\n"],
    ]);
  });
});
