// Completion of a method's settings that are now intent (definitions specification, section 11.4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../../src/assist/completion.js";
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
  it("offers the settings that are now intent last, naming the intent that replaces each", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace(
        "      with: { except_columns",
        "      with:\n        |\n      x: { except_columns",
      ),
    );
    const moved = ["mode", "sequence_by", "delete_when", "cluster_by"];
    const order = items.map((item) => item.label);
    const firstMoved = Math.min(...moved.map((label) => order.indexOf(label)));
    expect(order.slice(firstMoved).sort()).toEqual([...moved].sort());
    expect(items.find((item) => item.label === "mode")?.detail).toBe("now intent: history");
    expect(items.find((item) => item.label === "sequence_by")?.detail).toBe("now intent: sequence");
    expect(items.find((item) => item.label === "cluster_by")?.detail).toBe(
      "now intent: storage.clustering",
    );
  });
});
