// Completion of method choices: none where it may be written, and a standard's choices.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../src/completion.js";
import { openProject } from "../src/project.js";

const retail = join(import.meta.dirname, "../../cli/project-templates/retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");

/** Completions where `|` is in the edited text of `path`. */
function at(path: string, edit: (text: string) => string) {
  const marked = edit(read(path));
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const project = openProject(retail, new Map([[join(retail, path), text]]));
  return completionsAt(project, path, text, offset, project.environments[0]);
}
const labels = (items: { label: string }[]) => items.map((item) => item.label).sort();

describe("method choices", () => {
  it("offers a standard's store methods and none for store.default", () => {
    const items = at("standard.yaml", (text) => text.replace("store:\n", "store:\n  default: |\n"));
    expect(labels(items)).toEqual(["materialised-view", "none", "streaming-table"]);
  });

  it("offers none for a flow's serve.uses, so a flow can opt out", () => {
    const items = at("flows/shop.yaml", (text) =>
      text.replace("source: shop", "source: shop\nserve:\n  uses: |"),
    );
    expect(labels(items)).toContain("none");
  });

  it("does not offer none for a transform's store", () => {
    const items = at("transforms/daily_sales.yaml", (text) =>
      text.replace("contract:", "store:\n  uses: |\ncontract:"),
    );
    expect(labels(items)).not.toContain("none");
  });
});
