// Cursor features share diagnostics until the editor opens a fresh project snapshot.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { problems } from "../src/diagnostics.js";
import { problemsAt } from "../src/problems-at.js";
import { openProject } from "../src/project.js";
import { appliedSample } from "./applied.js";

const retail = appliedSample("retail");
const generated = "build/dev/src/retail/bronze/orders.sql";

describe("diagnostic snapshots", () => {
  it("does not scan or read files again for repeated diagnostic requests", () => {
    const project = openProject(retail, new Map());
    const list = vi.spyOn(project.files, "list");
    const read = vi.spyOn(project.files, "read");
    expect(problems(project, "dev")).toEqual([]);
    expect(list).toHaveBeenCalled();
    expect(read).toHaveBeenCalledWith(generated);
    list.mockClear();
    read.mockClear();
    expect(problems(project, "dev")).toEqual([]);
    expect(list).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("shares generated-file checks between reference details and quick fixes", () => {
    const project = openProject(retail, new Map());
    const read = vi.spyOn(project.files, "read");
    const file = "flows/shop.yaml";
    const text = project.files.read(file)!;
    for (const offset of [0, text.indexOf("source:"), text.length])
      problemsAt(project, file, text, offset, "dev");
    expect(read.mock.calls.filter(([path]) => path === generated)).toHaveLength(1);
  });

  it("keeps diagnostics separate for each environment", () => {
    const project = openProject(retail, new Map());
    expect(problems(project, "dev")).toEqual([]);
    expect(problems(project, "missing").some((problem) => problem.severity === "error")).toBe(true);
    expect(problems(project, "dev")).toEqual([]);
  });

  it("keeps caller changes out of cached diagnostics", () => {
    const path = join(retail, generated);
    const project = openProject(
      retail,
      new Map([[path, `${readFileSync(path, "utf8")}-- edit\n`]]),
    );
    const first = problems(project, "dev");
    const expected = structuredClone(first);
    expect(first).toHaveLength(1);
    first[0]!.message = "changed by caller";
    first[0]!.range.start.line = 99;
    first.length = 0;
    expect(problems(project, "dev")).toEqual(expected);
  });

  it("checks unsaved generated-file edits again in a fresh snapshot", () => {
    const clean = openProject(retail, new Map());
    expect(problems(clean, "dev")).toEqual([]);
    const path = join(retail, generated);
    const edited = openProject(retail, new Map([[path, `${readFileSync(path, "utf8")}-- edit\n`]]));
    expect(problems(edited, "dev")).toContainEqual(
      expect.objectContaining({ file: generated, code: "EDITED" }),
    );
    expect(problems(openProject(retail, new Map()), "dev")).toEqual([]);
  });

  it("checks external disk changes again after the project is reopened", () => {
    const folder = mkdtempSync(join(tmpdir(), "ingestron-diagnostics-"));
    try {
      cpSync(retail, folder, { recursive: true });
      expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
      const path = join(folder, generated);
      const original = readFileSync(path, "utf8");
      writeFileSync(path, `${original}-- external edit\n`);
      expect(problems(openProject(folder, new Map()), "dev")).toContainEqual(
        expect.objectContaining({ file: generated, code: "EDITED" }),
      );
      writeFileSync(path, original);
      expect(problems(openProject(folder, new Map()), "dev")).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
