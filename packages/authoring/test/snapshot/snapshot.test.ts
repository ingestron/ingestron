// ProjectSnapshot: a project as the editor sees it at one moment, with everything an
// editor asks of it as methods. Each method gives what its function gives.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  annotationsIn,
  compareEnvironments,
  completionsAt,
  definitionAt,
  fileMoveEdits,
  fixAll,
  generatedFiles,
  generatedLenses,
  hoverAt,
  moveSetting,
  openProject,
  platformRequest,
  problems,
  projectSymbols,
  ProjectSnapshot,
  quickFixes,
  referenceAt,
  referenceForDocs,
  referencesAt,
  renameAt,
  renameProblem,
} from "../../src/index.js";
import { filledTemplates } from "../starters.js";

const retail = join(filledTemplates, "retail");
const file = "flows/shop.yaml";
const text = readFileSync(join(retail, file), "utf8");
const at = (part: string) => text.indexOf(part) + 1;

describe("ProjectSnapshot", () => {
  it("opens the project as openProject does, open editors read first", () => {
    const changed = text.replace("Orders and customers", "Orders");
    const open = new Map([[join(retail, file), changed]]);
    const snapshot = ProjectSnapshot.open(retail, open);
    const project = openProject(retail, open);
    expect(snapshot.folder).toBe(project.folder);
    expect(snapshot.environments).toEqual(["dev", "prod"]);
    expect(snapshot.files.list()).toEqual(project.files.list());
    expect(snapshot.files.read(file)).toBe(changed);
  });

  it("reads only the disk when no editors are given", () => {
    expect(ProjectSnapshot.open(retail).files.read(file)).toBe(text);
  });

  // Each method on a snapshot, against its function on a separate project, so nothing kept
  // for one can answer for the other.
  const snapshot = ProjectSnapshot.open(retail, new Map());
  const project = openProject(retail, new Map());
  const whole = { start: { line: 0, character: 0 }, end: { line: 40, character: 0 } };

  it.each([
    ["problems", () => snapshot.problems("dev"), () => problems(project, "dev")],
    [
      "completionsAt",
      () => snapshot.completionsAt(file, text, at("upsert"), "dev"),
      () => completionsAt(project, file, text, at("upsert"), "dev"),
    ],
    [
      "quickFixes",
      () => snapshot.quickFixes("dev", file, whole),
      () => quickFixes(project, "dev", file, whole),
    ],
    [
      "fixAll",
      () => snapshot.fixAll("dev", "REPLACE_ME"),
      () => fixAll(project, "dev", "REPLACE_ME"),
    ],
    [
      "moveSetting",
      () => snapshot.moveSetting(file, text, at("mode"), "dev"),
      () => moveSetting(project, file, text, at("mode"), "dev"),
    ],
    [
      "hoverAt",
      () =>
        snapshot.hoverAt(file, text, at("upsert"), "dev", {
          docs: (link) => `https://docs${link}`,
        }),
      () =>
        hoverAt(project, file, text, at("upsert"), "dev", {
          docs: (link) => `https://docs${link}`,
        }),
    ],
    [
      "definitionAt",
      () => snapshot.definitionAt(file, at("shop.orders")),
      () => definitionAt(project, file, at("shop.orders")),
    ],
    [
      "referencesAt",
      () => snapshot.referencesAt(file, at("shop.orders")),
      () => referencesAt(project, file, at("shop.orders")),
    ],
    [
      "renameAt",
      () => snapshot.renameAt(file, at("shop.orders"), "shop.sales"),
      () => renameAt(project, file, at("shop.orders"), "shop.sales"),
    ],
    [
      "renameProblem",
      () => snapshot.renameProblem(file, at("shop.orders"), "shop customers"),
      () => renameProblem(project, file, at("shop.orders"), "shop customers"),
    ],
    [
      "fileMoveEdits",
      () => snapshot.fileMoveEdits(file, "flows/web.yaml"),
      () => fileMoveEdits(project, file, "flows/web.yaml"),
    ],
    ["symbols", () => snapshot.symbols(), () => projectSymbols(project)],
    [
      "compare",
      () => snapshot.compare("dev", "prod"),
      () => compareEnvironments(project, "dev", "prod"),
    ],
    ["request", () => snapshot.request("prod"), () => platformRequest(project, "prod")],
    ["generatedFiles", () => snapshot.generatedFiles("dev"), () => generatedFiles(project, "dev")],
    [
      "annotationsIn",
      () => snapshot.annotationsIn(file, text, "dev"),
      () => annotationsIn(project, file, text, "dev"),
    ],
    [
      "generatedLenses",
      () => snapshot.generatedLenses(file, text, "dev"),
      () => generatedLenses(project, file, text, "dev"),
    ],
    [
      "referenceAt",
      () => snapshot.referenceAt(file, text, at("upsert"), "dev"),
      () => referenceAt(project, file, text, at("upsert"), "dev"),
    ],
    [
      "referenceForDocs",
      () => snapshot.referenceForDocs("/docs/connectors/postgresql", "dev"),
      () => referenceForDocs(project, "/docs/connectors/postgresql", "dev"),
    ],
  ])("%s gives what its function gives", (_name, method, fn) => {
    expect(method()).toEqual(fn());
  });

  it("gives real answers on a starter, not empty ones", () => {
    expect(snapshot.symbols().length).toBeGreaterThan(0);
    expect(snapshot.referencesAt(file, at("shop.orders")).length).toBeGreaterThan(0);
    expect(snapshot.generatedFiles("dev")).not.toHaveProperty("problems");
    expect(snapshot.compare("dev", "prod")).toContain("dev");
  });

  it("can be given where a project is, to the functions it replaces", () => {
    expect(problems(snapshot, "prod")).toEqual(snapshot.problems("prod"));
  });
});
