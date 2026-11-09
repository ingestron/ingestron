// The editor resolves as plan does: every environment together. A pack that cannot be
// loaded is shown as a problem, in place of stopping the editor.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { annotationsIn } from "../src/annotations/annotations.js";
import { problems } from "../src/diagnostics/diagnostics.js";
import { hoverAt } from "../src/hover/hover.js";
import { compareEnvironments, platformRequest } from "../src/generation/platform-request.js";
import { openProject, resolved, resolvedForDisplay } from "../src/project/project.js";
import { brokenPackMessage, breakPacks, mendPacks } from "./broken-pack.js";
import { filledTemplates } from "./starters.js";

const cli = join(import.meta.dirname, "../../cli");
const retail = join(filledTemplates, "retail");

describe("resolving for the editor", () => {
  it("resolves every environment together, so test has the bundle's production mode", () => {
    const project = openProject(join(cli, "test/fixtures/environments"), new Map());
    expect(resolved(project, "dev").model?.platform.mode).toBe("development");
    expect(resolved(project, "test").model?.platform.mode).toBe("production");
    expect(resolvedForDisplay(project, "test").model?.platform.mode).toBe("production");
  });
});

describe("a pack that cannot be loaded", () => {
  afterEach(mendPacks);

  it("is one error on project.yaml, and stops nothing in the editor", () => {
    breakPacks();
    const project = openProject(retail, new Map());
    const found = problems(project, "dev").filter((problem) => problem.severity === "error");
    expect(found).toMatchObject([{ file: "project.yaml", code: "PACK_LOAD", severity: "error" }]);
    expect(found[0]?.message.split("\n")[0]).toBe(brokenPackMessage);
    const flow = "flows/shop.yaml";
    const text = readFileSync(join(retail, flow), "utf8");
    expect(() => annotationsIn(project, flow, text, "dev")).not.toThrow();
    expect(() => hoverAt(project, flow, text, text.indexOf("orders"), "dev")).not.toThrow();
  });

  it("is what the request and the comparison show", () => {
    breakPacks();
    const project = openProject(retail, new Map());
    expect(platformRequest(project, "dev")).toContain(brokenPackMessage);
    expect(compareEnvironments(project, "dev", "prod")).toContain(brokenPackMessage);
  });
});
