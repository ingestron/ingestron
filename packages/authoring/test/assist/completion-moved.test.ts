// Completion and hover of a method's settings that are now intent (definitions specification,
// section 11.4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../../src/assist/completion.js";
import { hoverAt } from "../../src/hover/hover.js";
import { openProject } from "../../src/project/project.js";
import { filledTemplates } from "../starters.js";

const retail = join(filledTemplates, "retail");

/** Completions where `|` is in the edited text of `path`. */
function at(path: string, edit: (text: string) => string) {
  const marked = edit(readFileSync(join(retail, path), "utf8"));
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const project = openProject(retail, new Map([[join(retail, path), text]]));
  return completionsAt(project, path, text, offset, project.environments[0]);
}

describe("completion of settings that are now intent", () => {
  const moved = ["mode", "sequence_by", "delete_when", "cluster_by"];

  it("does not offer them where writing one is SETTING_MOVED", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace(
        "      with: { except_columns",
        "      with:\n        |\n      x: { except_columns",
      ),
    );
    expect(items.length).toBeGreaterThan(0);
    for (const label of moved) expect(items.map((item) => item.label)).not.toContain(label);
  });

  it("offers them under the standard's fixed.<method>, where they are fixed intent", () => {
    const items = at("standard.yaml", (text) =>
      text.replace(
        "    streaming-table: { cluster_by: auto }",
        "    streaming-table:\n      cluster_by: auto\n      |\n",
      ),
    );
    expect(items.map((item) => item.label)).toContain("sequence_by");
  });
});

describe("hover on a setting that is now intent", () => {
  it("leads with the intent that replaces it", () => {
    const path = "flows/shop.yaml";
    const text = readFileSync(join(retail, path), "utf8").replace(
      "      with: { except_columns",
      "      with:\n        sequence_by: updated_at\n      x: { except_columns",
    );
    const project = openProject(retail, new Map([[join(retail, path), text]]));
    const shown = hoverAt(project, path, text, text.indexOf("sequence_by") + 2, "dev", {
      docs: (page) => page,
    });
    expect(shown).toMatch(
      /^\*\*Now intent:\*\* `sequence_by` is written as `sequence` under `intent`\./,
    );
  });
});
