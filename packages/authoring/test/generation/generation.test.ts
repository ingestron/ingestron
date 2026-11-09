// What generating every environment together gives the editor, as plan gives it: a
// pack's notices as problems, and the files, or what stops them, to preview.
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { problems } from "../../src/diagnostics/diagnostics.js";
import { generatedFiles } from "../../src/generation/preview.js";
import { openProject } from "../../src/project/project.js";
import { brokenPackMessage, breakPacks, mendPacks } from "../broken-pack.js";
import { filledTemplates } from "../starters.js";

const templates = filledTemplates;
const erp = join(templates, "private-sql-server");

describe("a pack's notices", () => {
  it("are warnings on project.yaml, as plan prints them under the pack", () => {
    const project = openProject(erp, new Map());
    const notices = problems(project, "dev").filter((problem) => problem.code === "PACK_NOTICE");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      file: "project.yaml",
      severity: "warning",
      range: { start: { line: 0, character: 0 } },
    });
    expect(notices[0]?.message).toContain("Integration runtime `shir-erp` (self-hosted)");
  });

  it("are shown for every environment, since the pack builds them together", () => {
    const project = openProject(erp, new Map());
    const codes = (environment: string) =>
      problems(project, environment).map((problem) => problem.code);
    expect(codes("dev")).toEqual(["PACK_NOTICE"]);
    expect(codes("prod")).toEqual(["PACK_NOTICE"]);
  });

  it("leave the generated files to preview", () => {
    expect(Array.isArray(generatedFiles(openProject(erp, new Map()), "dev"))).toBe(true);
  });
});

describe("a pack that cannot be loaded", () => {
  afterEach(mendPacks);

  it("is what the preview shows in place of the files", () => {
    breakPacks();
    const files = generatedFiles(openProject(join(templates, "retail"), new Map()), "dev");
    expect(Array.isArray(files) ? "files" : files.problems).toContain(
      `error  PACK_LOAD\n  ${brokenPackMessage}`,
    );
  });
});
