// Completion of `${…}` inside project.yaml, where a value may read other values.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completionsAt } from "../../src/assist/completion.js";
import { openProject } from "../../src/project/project.js";
import { filledTemplates } from "../starters.js";

const retail = join(filledTemplates, "retail");
const read = (path: string) => readFileSync(join(retail, path), "utf8");

describe("references in project.yaml", () => {
  const manifest = (edit: (text: string) => string) => {
    const marked = edit(read("project.yaml"));
    const offset = marked.indexOf("|");
    const text = marked.replace("|", "");
    const project = openProject(retail, new Map([[join(retail, "project.yaml"), text]]));
    return completionsAt(project, "project.yaml", text, offset, "prod").map((item) => item.label);
  };

  it("offers the forms a value may use there, values included", () => {
    const labels = manifest((text) => text.replace("values:\n", "values:\n  account: sa_${|\n"));
    expect(labels).toContain("environment.name");
    expect(labels).toContain("values.");
  });

  it("offers the other values after ${values., never the value being written", () => {
    const labels = manifest((text) =>
      text.replace("values:\n", "values:\n  on_failure_copy: ${values.|}\n"),
    );
    expect(labels).toContain("engineers");
    expect(labels).toContain("storage_account");
    expect(labels).not.toContain("on_failure_copy");
  });

  it("offers the names inside a mapping after ${values.<name>.", () => {
    const labels = manifest((text) =>
      text
        .replace(
          "values:\n",
          "values:\n  cluster: { workers: 2, size: small }\n  label: ${values.cluster.|}\n",
        )
        .replace("  prod:\n    values:\n", "  prod:\n    values:\n      cluster: { zone: b }\n"),
    );
    expect(labels).toEqual(["size", "workers", "zone"]);
  });
});

describe("replacing a reference's name around the cursor", () => {
  const at = (line: string) => {
    const marked = read("project.yaml").replace("values:\n", `values:\n${line}\n`);
    const offset = marked.indexOf("|");
    const text = marked.replace("|", "");
    const project = openProject(retail, new Map([[join(retail, "project.yaml"), text]]));
    const found = completionsAt(project, "project.yaml", text, offset, "prod");
    const item = found.find((suggestion) => suggestion.label === "engineers")!;
    const replaced = text.slice(0, item.replaceFrom) + item.label + text.slice(item.replaceTo);
    return replaced.split("\n").find((written) => written.startsWith("  copy:"));
  };

  it("replaces the name after the cursor, not only the part before it", () => {
    expect(at("  copy: x_${values.|engineers}_y")).toBe("  copy: x_${values.engineers}_y");
    expect(at("  copy: x_${values.eng|ineers}_y")).toBe("  copy: x_${values.engineers}_y");
    expect(at("  copy: x_${values.|}_y")).toBe("  copy: x_${values.engineers}_y");
  });
});
